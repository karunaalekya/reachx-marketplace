package com.marketplace.payment.gateway;

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
import java.util.Base64;
import java.util.Map;
import java.util.UUID;

@Component("cashfreeGateway")
@Slf4j
public class CashfreeGateway implements PaymentGateway {

    private final RestClient restClient;
    private final String clientId;
    private final String clientSecret;
    private final String webhookSecret;

    public CashfreeGateway(
            @Value("${cashfree.client-id}") String clientId,
            @Value("${cashfree.client-secret}") String clientSecret,
            @Value("${cashfree.webhook-secret}") String webhookSecret,
            @Value("${cashfree.base-url:https://sandbox.cashfree.com/pg}") String baseUrl) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.webhookSecret = webhookSecret;
        this.restClient = RestClient.builder().baseUrl(baseUrl).build();
    }

    @Override
    public GatewayOrderResult createOrder(String internalOrderNumber, BigDecimal amount, String currency) {
        // Cashfree order IDs must be unique per attempt (unlike Razorpay's receipt field) -
        // appending a short random suffix so a retried checkout doesn't collide with the first attempt.
        String cfOrderId = internalOrderNumber + "-" + UUID.randomUUID().toString().substring(0, 8);

        Map<String, Object> body = Map.of(
                "order_id", cfOrderId,
                "order_amount", amount,
                "order_currency", currency,
                "order_note", "Marketplace order " + internalOrderNumber
        );

        try {
            JsonNode response = restClient.post()
                    .uri("/orders")
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("x-client-id", clientId)
                    .header("x-client-secret", clientSecret)
                    .header("x-api-version", "2023-08-01")
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            log.info("Cashfree order created: internalOrderNumber={} cfOrderId={}", internalOrderNumber, cfOrderId);
            return new GatewayOrderResult(cfOrderId, response.toString());
        } catch (Exception e) {
            log.error("Cashfree order creation failed for internalOrderNumber={}", internalOrderNumber, e);
            throw new PaymentGatewayException("Failed to create Cashfree order", e);
        }
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        // Cashfree signs webhooks as base64(HMAC-SHA256(timestamp + payload, webhookSecret)),
        // with the signature and timestamp both sent as separate headers.
        // signatureHeader here is expected as "timestamp.signature" - controller must pass both.
        try {
            String[] parts = signatureHeader.split("\\.", 2);
            if (parts.length != 2) return false;
            String timestamp = parts[0];
            String providedSignature = parts[1];

            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(webhookSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] computed = mac.doFinal((timestamp + payload).getBytes(StandardCharsets.UTF_8));
            String computedSignature = Base64.getEncoder().encodeToString(computed);

            return java.security.MessageDigest.isEqual(
                    computedSignature.getBytes(StandardCharsets.UTF_8),
                    providedSignature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.warn("Cashfree webhook signature verification failed", e);
            return false;
        }
    }

    @Override
    public RefundResult refund(String gatewayOrderId, BigDecimal amount, String reason) {
        // Cashfree refunds are keyed by their order_id (not a separate payment id like Razorpay),
        // which is why gatewayOrderId is what's passed in here despite the interface's generic name.
        String refundId = "RFND-" + gatewayOrderId + "-" + UUID.randomUUID().toString().substring(0, 6);

        Map<String, Object> body = Map.of(
                "refund_amount", amount,
                "refund_id", refundId,
                "refund_note", reason
        );

        try {
            JsonNode response = restClient.post()
                    .uri("/orders/{orderId}/refunds", gatewayOrderId)
                    .contentType(MediaType.APPLICATION_JSON)
                    .header("x-client-id", clientId)
                    .header("x-client-secret", clientSecret)
                    .header("x-api-version", "2023-08-01")
                    .body(body)
                    .retrieve()
                    .body(JsonNode.class);

            log.info("Cashfree refund issued: gatewayOrderId={} refundId={} amount={}",
                    gatewayOrderId, refundId, amount);
            return new RefundResult(refundId, response.toString());
        } catch (Exception e) {
            log.error("Cashfree refund failed for gatewayOrderId={}", gatewayOrderId, e);
            throw new PaymentGatewayException("Failed to process Cashfree refund", e);
        }
    }
}
