package com.marketplace.payout.gateway;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

// Cashfree Payouts (payout.cashfree.com/payout/v1) - a DIFFERENT product/API from Cashfree's
// payment-collection gateway (CashfreeGateway, sandbox.cashfree.com/pg), with its own
// client id/secret pair, its own auth flow (bearer token, not per-request headers), and its own
// webhook secret. Locked decision (PROJECT_STATE.md): primary payout gateway, not Razorpay
// Route/Split - Route ties settlement to swipe-time, which breaks the partial-refund and
// delayed-delivery-confirmation flows this platform actually has.
@Component("cashfreePayoutGateway")
@Slf4j
public class CashfreePayoutGateway implements PayoutGateway {

    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;
    private final String webhookSecret;

    // Cashfree Payouts auth tokens are short-lived (~10 min) bearer tokens, not per-request
    // signed headers like the PG product - cached here and refreshed on expiry/401 rather than
    // re-authorizing on every single beneficiary/transfer call.
    private final ReentrantLock tokenLock = new ReentrantLock();
    private volatile String cachedToken;
    private volatile Instant tokenExpiresAt = Instant.EPOCH;

    public CashfreePayoutGateway(
            @Value("${cashfree.payouts.client-id}") String clientId,
            @Value("${cashfree.payouts.client-secret}") String clientSecret,
            @Value("${cashfree.payouts.webhook-secret}") String webhookSecret,
            @Value("${cashfree.payouts.base-url:https://payout-gamma.cashfree.com/payout/v1}") String baseUrl) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.webhookSecret = webhookSecret;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    private String authToken() {
        if (cachedToken != null && Instant.now().isBefore(tokenExpiresAt)) {
            return cachedToken;
        }
        tokenLock.lock();
        try {
            // Re-check inside the lock - another thread may have already refreshed while this
            // one was waiting.
            if (cachedToken != null && Instant.now().isBefore(tokenExpiresAt)) {
                return cachedToken;
            }
            JsonNode response = restClient.post()
                    .uri("/authorize")
                    .header("X-Client-Id", clientId)
                    .header("X-Client-Secret", clientSecret)
                    .retrieve()
                    .body(JsonNode.class);

            String token = response.path("data").path("token").asText(null);
            if (token == null) {
                throw new PayoutGatewayException("Cashfree Payouts authorize call returned no token");
            }
            // Refresh 60s before actual expiry as a safety margin against clock skew / in-flight
            // requests started just before expiry.
            long expiresInSeconds = response.path("data").path("expiry").asLong(540);
            cachedToken = token;
            tokenExpiresAt = Instant.now().plusSeconds(Math.max(60, expiresInSeconds - 60));
            return cachedToken;
        } catch (PayoutGatewayException e) {
            throw e;
        } catch (Exception e) {
            log.error("Cashfree Payouts authorization failed", e);
            throw new PayoutGatewayException("Failed to authorize with Cashfree Payouts", e);
        } finally {
            tokenLock.unlock();
        }
    }

    @Override
    public BeneficiaryResult registerBeneficiary(BeneficiaryRequest request) {
        // beneId must be unique per beneficiary at Cashfree - the vendor's own internal id is
        // stable and unique, so it's used directly rather than generating a random one, which
        // also makes registerBeneficiary naturally idempotent: re-submitting the same vendor's
        // bank details calls addBeneficiary again with the same beneId, which Cashfree treats as
        // an update rather than a duplicate-create error.
        Map<String, Object> body = new HashMap<>();
        body.put("beneId", "VENDOR-" + request.vendorReference());
        body.put("name", request.accountHolderName());
        body.put("email", request.email() != null ? request.email() : "vendor@marketplace.local");
        body.put("phone", request.phone() != null ? request.phone() : "9999999999");
        if (request.vpa() != null && !request.vpa().isBlank()) {
            body.put("vpa", request.vpa());
        } else {
            body.put("bankAccount", request.accountNumber());
            body.put("ifsc", request.ifscCode());
        }
        body.put("address1", "NA");

        try {
            JsonNode response = restClient.post()
                    .uri("/addBeneficiary")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + authToken())
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            String status = response.path("subCode").asText("");
            // Cashfree returns subCode "200" on success (beneficiary added/verified),
            // non-"200" (e.g. "409" already exists, "400" validation error) needs review.
            boolean success = "200".equals(status);
            if (!success) {
                String message = response.path("message").asText("Unknown Cashfree beneficiary error");
                log.warn("Cashfree beneficiary registration not fully successful: beneId=VENDOR-{} message={}",
                        request.vendorReference(), message);
                return new BeneficiaryResult("VENDOR-" + request.vendorReference(), false, response.toString());
            }

            log.info("Cashfree beneficiary registered: beneId=VENDOR-{}", request.vendorReference());
            return new BeneficiaryResult("VENDOR-" + request.vendorReference(), true, response.toString());
        } catch (Exception e) {
            log.error("Cashfree beneficiary registration failed for vendor={}", request.vendorReference(), e);
            throw new PayoutGatewayException("Failed to register beneficiary with Cashfree Payouts", e);
        }
    }

    @Override
    public TransferResult transfer(String beneficiaryId, BigDecimal amount, String idempotencyKey, String remarks) {
        Map<String, Object> body = Map.of(
                "beneId", beneficiaryId,
                "amount", amount.toPlainString(),
                // Cashfree's own transferId doubles as its idempotency key: a repeated call with
                // the same transferId returns the original transfer's status instead of moving
                // money twice - this is the gateway-side half of the double-payout protection
                // described in PayoutGateway.transfer's javadoc.
                "transferId", idempotencyKey,
                "transferMode", "banktransfer",
                "remarks", remarks != null ? remarks.substring(0, Math.min(remarks.length(), 60)) : "Marketplace payout"
        );

        try {
            JsonNode response = restClient.post()
                    .uri("/requestTransfer")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", "Bearer " + authToken())
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            String subCode = response.path("subCode").asText("");
            String cfStatus = response.path("data").path("status").asText("PENDING");

            TransferStatus status = switch (cfStatus.toUpperCase()) {
                case "SUCCESS" -> TransferStatus.COMPLETED;
                case "REJECTED", "FAILED" -> TransferStatus.FAILED;
                case "PROCESSING" -> TransferStatus.PROCESSING;
                default -> TransferStatus.PENDING;
            };

            if (!"200".equals(subCode) && status != TransferStatus.PENDING) {
                String message = response.path("message").asText("Unknown Cashfree transfer error");
                log.warn("Cashfree transfer not accepted: transferId={} message={}", idempotencyKey, message);
                return new TransferResult(idempotencyKey, TransferStatus.FAILED, response.toString());
            }

            log.info("Cashfree transfer initiated: transferId={} beneId={} amount={} status={}",
                    idempotencyKey, beneficiaryId, amount, status);
            return new TransferResult(idempotencyKey, status, response.toString());
        } catch (Exception e) {
            log.error("Cashfree transfer request failed: transferId={} beneId={}", idempotencyKey, beneficiaryId, e);
            throw new PayoutGatewayException("Failed to request Cashfree transfer", e);
        }
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        // Cashfree Payouts webhooks sign as base64(HMAC-SHA256(payload, webhookSecret)) - simpler
        // than the PG product's timestamp-prefixed scheme (see CashfreeGateway), since Payouts
        // webhooks use a single X-Cf-Signature header with no separate timestamp header.
        if (signatureHeader == null || signatureHeader.isBlank()) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] computed = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String computedSignature = Base64.getEncoder().encodeToString(computed);

            return java.security.MessageDigest.isEqual(
                    computedSignature.getBytes(StandardCharsets.UTF_8),
                    signatureHeader.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("Cashfree Payouts webhook signature verification failed", e);
            return false;
        }
    }
}
