package com.marketplace.payment.gateway;

import java.math.BigDecimal;

public interface PaymentGateway {

    GatewayOrderResult createOrder(String internalOrderNumber, BigDecimal amount, String currency);

    // Verifies the webhook's signature against the gateway's secret. MUST be called before
    // trusting any webhook payload - an unverified webhook is an open door for anyone to
    // POST "payment succeeded" for an order they never paid for.
    boolean verifyWebhookSignature(String payload, String signatureHeader);

    // Issues a refund for a previously captured payment. gatewayPaymentId is the gateway's
    // own payment identifier (NOT our internal order number) - captured from the webhook
    // when the original payment succeeded.
    RefundResult refund(String gatewayPaymentId, BigDecimal amount, String reason);

    record GatewayOrderResult(String gatewayOrderId, String rawResponse) {}
    record RefundResult(String gatewayRefundId, String rawResponse) {}
}
