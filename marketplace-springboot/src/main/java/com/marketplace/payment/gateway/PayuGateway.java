package com.marketplace.payment.gateway;

import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Map;
import java.util.UUID;

// PayU's integration model is genuinely different from Razorpay/Cashfree: there is no
// "create order" API call. Instead, the merchant generates a SHA-512 hash and the FRONTEND
// posts a signed HTML form directly to PayU's hosted checkout page. This class produces
// that hash + the transaction id; it does not call PayU's servers at all for order creation.
@Component("payuGateway")
@Slf4j
public class PayuGateway implements PaymentGateway {

    private final String merchantKey;
    private final String salt;

    public PayuGateway(
            @Value("${payu.merchant-key}") String merchantKey,
            @Value("${payu.salt}") String salt) {
        this.merchantKey = merchantKey;
        this.salt = salt;
    }

    @Override
    public GatewayOrderResult createOrder(String internalOrderNumber, BigDecimal amount, String currency) {
        String txnId = internalOrderNumber + "-" + UUID.randomUUID().toString().substring(0, 8);

        String productInfo = "Marketplace Order";
        String firstName = "Customer";
        String email = "customer@marketplace.local"; // GAP: should be the real order's customerEmail - PaymentService needs to pass this through

        // PayU's documented forward-hash formula (v1, 5 udf fields, do not reorder):
        // sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||salt)
        String hashString = String.join("|",
                merchantKey, txnId, amount.toPlainString(), productInfo, firstName, email,
                "", "", "", "", "", "", "", "", "", "", salt);

        String hash = sha512(hashString);

        JSONObject formParams = new JSONObject();
        formParams.put("key", merchantKey);
        formParams.put("txnid", txnId);
        formParams.put("amount", amount.toPlainString());
        formParams.put("productinfo", productInfo);
        formParams.put("firstname", firstName);
        formParams.put("email", email);
        formParams.put("hash", hash);

        log.info("PayU checkout hash generated: internalOrderNumber={} txnId={}", internalOrderNumber, txnId);
        return new GatewayOrderResult(txnId, formParams.toString());
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        // PayU's webhook arrives as form-encoded fields, not a single opaque payload string -
        // the generic interface shape (payload + one signature header) doesn't fit PayU's model.
        // Real verification happens in verifyFormWebhook(Map) below, which the controller calls
        // directly for PayU instead of this method. This override exists only to satisfy the
        // interface contract; calling it directly is a caller error, so it fails closed.
        log.warn("PayuGateway.verifyWebhookSignature(String,String) was called directly - " +
                "PayU webhooks must use verifyFormWebhook(Map<String,String>) instead. Rejecting.");
        return false;
    }

    // Real PayU reverse-hash verification, using PayU's documented formula and the fields
    // PayU actually sends in its webhook form body. NOTE: this formula is built from PayU's
    // public API documentation, not tested against a live PayU sandbox response - the single
    // most common PayU integration bug is a subtly wrong field order in this exact string, so
    // this MUST be validated against a real PayU test transaction before going live. It fails
    // closed (rejects) on any mismatch, so a formula bug here blocks payments rather than
    // silently accepting forged ones - the safe direction for a bug to exist in, but still a
    // bug worth catching before launch.
    public boolean verifyFormWebhook(Map<String, String> params) {
        String status = params.getOrDefault("status", "");
        String email = params.getOrDefault("email", "");
        String firstName = params.getOrDefault("firstname", "");
        String productInfo = params.getOrDefault("productinfo", "");
        String amount = params.getOrDefault("amount", "");
        String txnId = params.getOrDefault("txnid", "");
        String providedHash = params.getOrDefault("hash", "");

        if (providedHash.isBlank()) {
            log.warn("PayU webhook missing hash field - rejecting");
            return false;
        }

        // Documented reverse formula: sha512(salt|status|||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
        String reverseHashString = String.join("|",
                salt, status, "", "", "", "", "", email, firstName, productInfo, amount, txnId, merchantKey);

        String computedHash = sha512(reverseHashString);

        boolean valid = MessageDigest.isEqual(
                computedHash.getBytes(StandardCharsets.UTF_8),
                providedHash.getBytes(StandardCharsets.UTF_8));

        if (!valid) {
            log.warn("PayU webhook signature mismatch: txnId={} - either forged, or the hash " +
                    "formula needs validation against PayU's real sandbox response", txnId);
        }
        return valid;
    }

    @Override
    public RefundResult refund(String gatewayPaymentId, BigDecimal amount, String reason) {
        // PayU refunds go through a DIFFERENT API entirely (their "Verify/Cancel-Refund" API),
        // authenticated with a separate merchant salt-based hash from the checkout flow, and
        // require PayU's own mihpayid (captured from the webhook, not modeled end-to-end yet).
        // Rather than fake a call that would silently fail against PayU's real servers, this
        // throws clearly so a refund attempt on a PayU order fails loud, not silent.
        throw new UnsupportedOperationException(
                "PayU refunds are not yet implemented - requires PayU's separate Verify/Refund API " +
                "integration (different auth flow from checkout). Process this refund manually via " +
                "the PayU merchant dashboard until this is built.");
    }

    private String sha512(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-512");
            byte[] hashBytes = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hashBytes) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new PaymentGatewayException("Failed to compute PayU hash", e);
        }
    }
}
