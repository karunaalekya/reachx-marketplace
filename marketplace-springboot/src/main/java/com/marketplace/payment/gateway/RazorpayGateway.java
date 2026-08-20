package com.marketplace.payment.gateway;

import com.razorpay.RazorpayClient;
import com.razorpay.RazorpayException;
import com.razorpay.Utils;
import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component("razorpayGateway")
@Slf4j
public class RazorpayGateway implements PaymentGateway {

    private final RazorpayClient client;
    private final String webhookSecret;

    public RazorpayGateway(
            @Value("${razorpay.key-id}") String keyId,
            @Value("${razorpay.key-secret}") String keySecret,
            @Value("${razorpay.webhook-secret}") String webhookSecret) throws RazorpayException {
        this.client = new RazorpayClient(keyId, keySecret);
        this.webhookSecret = webhookSecret;
    }

    @Override
    public GatewayOrderResult createOrder(String internalOrderNumber, BigDecimal amount, String currency) {
        try {
            JSONObject options = new JSONObject();
            // Razorpay expects amount in the smallest currency unit (paise for INR), not rupees.
            options.put("amount", amount.multiply(BigDecimal.valueOf(100)).intValue());
            options.put("currency", currency);
            options.put("receipt", internalOrderNumber);

            com.razorpay.Order rzpOrder = client.orders.create(options);
            String gatewayOrderId = rzpOrder.get("id");

            log.info("Razorpay order created: internalOrderNumber={} gatewayOrderId={}",
                    internalOrderNumber, gatewayOrderId);

            return new GatewayOrderResult(gatewayOrderId, rzpOrder.toString());
        } catch (RazorpayException e) {
            log.error("Razorpay order creation failed for internalOrderNumber={}", internalOrderNumber, e);
            throw new PaymentGatewayException("Failed to create Razorpay order", e);
        }
    }

    @Override
    public boolean verifyWebhookSignature(String payload, String signatureHeader) {
        try {
            // This is the security-critical line: without it, anyone who knows an order number
            // could POST a fake "payment success" webhook and get free product.
            return Utils.verifyWebhookSignature(payload, signatureHeader, webhookSecret);
        } catch (RazorpayException e) {
            log.warn("Razorpay webhook signature verification failed", e);
            return false;
        }
    }

    @Override
    public RefundResult refund(String gatewayPaymentId, BigDecimal amount, String reason) {
        try {
            JSONObject options = new JSONObject();
            options.put("amount", amount.multiply(BigDecimal.valueOf(100)).intValue());
            JSONObject notes = new JSONObject();
            notes.put("reason", reason);
            options.put("notes", notes);

            com.razorpay.Refund refund = client.payments.refund(gatewayPaymentId, options);
            String refundId = refund.get("id");

            log.info("Razorpay refund issued: gatewayPaymentId={} refundId={} amount={}",
                    gatewayPaymentId, refundId, amount);

            return new RefundResult(refundId, refund.toString());
        } catch (RazorpayException e) {
            log.error("Razorpay refund failed for gatewayPaymentId={}", gatewayPaymentId, e);
            throw new PaymentGatewayException("Failed to process Razorpay refund", e);
        }
    }
}
