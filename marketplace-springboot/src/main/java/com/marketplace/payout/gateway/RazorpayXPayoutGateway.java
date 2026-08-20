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
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.Map;

// RazorpayX Payouts - the secondary/alternate payout gateway named in the locked decision
// (PROJECT_STATE.md: "Cashfree Payouts / RazorpayX"). Deliberately NOT Razorpay Route/Split,
// which was explicitly ruled out (ties settlement to swipe-time, breaks partial refunds and
// delayed delivery confirmation).
//
// Same auth as the regular Razorpay payment gateway (HTTP Basic, key_id:key_secret) but a
// completely different API surface (contacts -> fund_accounts -> payouts, all under
// api.razorpay.com/v1) and a SEPARATE webhook secret from RazorpayGateway's payment-collection
// webhooks, since RazorpayX payouts and Razorpay payments are configured as independent webhook
// subscriptions in the dashboard even though they share a signing scheme.
//
// Honest limitation, same posture as PayuGateway elsewhere in this codebase: implemented
// against RazorpayX's public API documentation, but NOT verified against a live RazorpayX
// account (no sandbox access in the environment this was built in). Validate contact/fund
// account/payout creation against one real test payout before trusting this in production -
// see README "Before this is client-ready".
@Component("razorpayxGateway")
@Slf4j
public class RazorpayXPayoutGateway implements PayoutGateway {

    private final RestClient restClient;
    private final String authHeader;
    private final String payoutSourceAccountNumber;
    private final String webhookSecret;

    public RazorpayXPayoutGateway(
            @Value("${razorpayx.key-id}") String keyId,
            @Value("${razorpayx.key-secret}") String keySecret,
            @Value("${razorpayx.account-number}") String payoutSourceAccountNumber,
            @Value("${razorpayx.webhook-secret}") String webhookSecret,
            @Value("${razorpayx.base-url:https://api.razorpay.com/v1}") String baseUrl) {
        this.authHeader = "Basic " + java.util.Base64.getEncoder()
                .encodeToString((keyId + ":" + keySecret).getBytes(StandardCharsets.UTF_8));
        this.payoutSourceAccountNumber = payoutSourceAccountNumber;
        this.webhookSecret = webhookSecret;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    @Override
    public BeneficiaryResult registerBeneficiary(BeneficiaryRequest request) {
        try {
            // Step 1: contact - RazorpayX models a payee as a "contact" first, then attaches
            // one or more "fund accounts" (bank account or VPA) to it. reference_id is our own
            // vendor id, which also makes this call idempotent on RazorpayX's side for the same
            // vendor (a repeated contact create with the same reference_id updates rather than
            // duplicates).
            Map<String, Object> contactBody = Map.of(
                    "name", request.accountHolderName(),
                    "email", request.email() != null ? request.email() : "vendor@marketplace.local",
                    "contact", request.phone() != null ? request.phone() : "9999999999",
                    "type", "vendor",
                    "reference_id", "VENDOR-" + request.vendorReference()
            );

            JsonNode contactResponse = restClient.post()
                    .uri("/contacts")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authHeader)
                    .body(contactBody)
                    .retrieve()
                    .body(JsonNode.class);

            String contactId = contactResponse.path("id").asText(null);
            if (contactId == null) {
                throw new PayoutGatewayException("RazorpayX contact creation returned no id: " + contactResponse);
            }

            // Step 2: fund account - bank account, or VPA if the vendor registered UPI instead.
            Map<String, Object> fundAccountBody;
            if (request.vpa() != null && !request.vpa().isBlank()) {
                fundAccountBody = Map.of(
                        "contact_id", contactId,
                        "account_type", "vpa",
                        "vpa", Map.of("address", request.vpa())
                );
            } else {
                fundAccountBody = Map.of(
                        "contact_id", contactId,
                        "account_type", "bank_account",
                        "bank_account", Map.of(
                                "name", request.accountHolderName(),
                                "ifsc", request.ifscCode(),
                                "account_number", request.accountNumber()
                        )
                );
            }

            JsonNode fundAccountResponse = restClient.post()
                    .uri("/fund_accounts")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authHeader)
                    .body(fundAccountBody)
                    .retrieve()
                    .body(JsonNode.class);

            String fundAccountId = fundAccountResponse.path("id").asText(null);
            boolean active = "active".equalsIgnoreCase(fundAccountResponse.path("active").asText("true"))
                    || fundAccountResponse.path("active").asBoolean(true);

            if (fundAccountId == null) {
                log.warn("RazorpayX fund account creation returned no id: {}", fundAccountResponse);
                return new BeneficiaryResult(null, false, fundAccountResponse.toString());
            }

            log.info("RazorpayX fund account registered: vendor={} contactId={} fundAccountId={}",
                    request.vendorReference(), contactId, fundAccountId);
            // fundAccountId (not contactId) is what a payout is actually created against, so
            // this becomes the "beneficiaryId" this system stores and passes to transfer().
            return new BeneficiaryResult(fundAccountId, active, fundAccountResponse.toString());
        } catch (PayoutGatewayException e) {
            throw e;
        } catch (Exception e) {
            log.error("RazorpayX beneficiary (contact + fund account) registration failed for vendor={}",
                    request.vendorReference(), e);
            throw new PayoutGatewayException("Failed to register beneficiary with RazorpayX", e);
        }
    }

    @Override
    public TransferResult transfer(String fundAccountId, BigDecimal amount, String idempotencyKey, String remarks) {
        // RazorpayX amounts are in paise (smallest currency unit), same convention as
        // Razorpay's payment-collection API.
        long amountPaise = amount.multiply(BigDecimal.valueOf(100)).setScale(0, RoundingMode.HALF_UP).longValueExact();

        Map<String, Object> body = Map.of(
                "account_number", payoutSourceAccountNumber,
                "fund_account_id", fundAccountId,
                "amount", amountPaise,
                "currency", "INR",
                "mode", "IMPS",
                "purpose", "payout",
                "queue_if_low_balance", true,
                "reference_id", idempotencyKey,
                "narration", remarks != null ? remarks.substring(0, Math.min(remarks.length(), 30)) : "Payout"
        );

        try {
            JsonNode response = restClient.post()
                    .uri("/payouts")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("Authorization", authHeader)
                    // Belt-and-suspenders idempotency in addition to reference_id above -
                    // RazorpayX honors this header the same way Razorpay's payment API does for
                    // order creation, so a retried request with the same key never creates a
                    // second payout.
                    .header("X-Payout-Idempotency", idempotencyKey)
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            String rzStatus = response.path("status").asText("queued");
            TransferStatus status = switch (rzStatus.toLowerCase()) {
                case "processed" -> TransferStatus.COMPLETED;
                case "reversed", "rejected", "cancelled", "failed" -> TransferStatus.FAILED;
                case "processing" -> TransferStatus.PROCESSING;
                default -> TransferStatus.PENDING;   // "queued"
            };

            String transferId = response.path("id").asText(idempotencyKey);
            log.info("RazorpayX payout initiated: id={} fundAccountId={} amount={} status={}",
                    transferId, fundAccountId, amount, status);
            return new TransferResult(transferId, status, response.toString());
        } catch (Exception e) {
            log.error("RazorpayX payout request failed: referenceId={} fundAccountId={}", idempotencyKey, fundAccountId, e);
            throw new PayoutGatewayException("Failed to request RazorpayX payout", e);
        }
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        // Same hex-encoded HMAC-SHA256 scheme as standard Razorpay webhooks (X-Razorpay-Signature)
        // - but against RazorpayX's own webhook secret, configured as a separate webhook
        // subscription in the Razorpay dashboard from payment-collection webhooks.
        if (signatureHeader == null || signatureHeader.isBlank()) return false;
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] computed = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            String computedHex = HexFormat.of().formatHex(computed);

            return java.security.MessageDigest.isEqual(
                    computedHex.getBytes(StandardCharsets.UTF_8),
                    signatureHeader.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("RazorpayX webhook signature verification failed", e);
            return false;
        }
    }
}
