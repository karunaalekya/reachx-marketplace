package com.marketplace.payment.controller;

import com.marketplace.payment.dto.InitiatePaymentResponse;
import com.marketplace.payment.gateway.PaymentGateway;
import com.marketplace.payment.model.Payment;
import com.marketplace.payment.service.PaymentService;
import lombok.extern.slf4j.Slf4j;
import org.json.JSONObject;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/payments")
@Slf4j
public class PaymentController {

    private final PaymentService paymentService;
    private final Map<String, PaymentGateway> gateways;

    public PaymentController(PaymentService paymentService, Map<String, PaymentGateway> gateways) {
        this.paymentService = paymentService;
        this.gateways = gateways;
    }

    // gateway param lets the frontend/checkout page choose which of the three to use.
    // Defaults to Razorpay if not specified, since it's the only fully webhook-verified one.
    @PostMapping("/orders/{orderId}/initiate")
    public ResponseEntity<InitiatePaymentResponse> initiate(
            @PathVariable Long orderId,
            @RequestParam(defaultValue = "RAZORPAY") Payment.Gateway gateway) {
        return ResponseEntity.ok(paymentService.initiatePayment(orderId, gateway));
    }

    // Razorpay webhook - HMAC signature in a header, JSON payload.
    @PostMapping("/webhook/razorpay")
    public ResponseEntity<String> razorpayWebhook(
            @RequestBody String rawPayload,
            @RequestHeader("X-Razorpay-Signature") String signature) {

        PaymentGateway razorpay = gateways.get("razorpayGateway");
        if (!razorpay.verifyWebhookSignature(rawPayload, signature)) {
            log.warn("Rejected Razorpay webhook - signature verification failed");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature");
        }

        JSONObject payload = new JSONObject(rawPayload);
        String eventId = payload.optString("event_id", payload.optString("id"));
        String event = payload.optString("event");
        JSONObject paymentEntity = payload.optJSONObject("payload").optJSONObject("payment").optJSONObject("entity");

        boolean success = "payment.captured".equals(event);
        paymentService.processWebhook(
                eventId, paymentEntity.optString("order_id"), paymentEntity.optString("id"),
                success, success ? null : paymentEntity.optString("error_description", "Payment failed"));

        return ResponseEntity.ok("OK");
    }

    // Cashfree webhook - HMAC in "x-webhook-timestamp" + "x-webhook-signature" headers, JSON payload.
    @PostMapping("/webhook/cashfree")
    public ResponseEntity<String> cashfreeWebhook(
            @RequestBody String rawPayload,
            @RequestHeader("x-webhook-timestamp") String timestamp,
            @RequestHeader("x-webhook-signature") String signature) {

        PaymentGateway cashfree = gateways.get("cashfreeGateway");
        // CashfreeGateway.verifyWebhookSignature expects "timestamp.signature" combined.
        if (!cashfree.verifyWebhookSignature(rawPayload, timestamp + "." + signature)) {
            log.warn("Rejected Cashfree webhook - signature verification failed");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature");
        }

        JSONObject payload = new JSONObject(rawPayload);
        JSONObject data = payload.optJSONObject("data");
        JSONObject order = data != null ? data.optJSONObject("order") : null;
        JSONObject paymentData = data != null ? data.optJSONObject("payment") : null;

        String eventId = payload.optString("event_time") + "-" + (order != null ? order.optString("order_id") : "");
        boolean success = "PAYMENT_SUCCESS_WEBHOOK".equals(payload.optString("type"));

        paymentService.processWebhook(
                eventId,
                order != null ? order.optString("order_id") : null,
                paymentData != null ? paymentData.optString("cf_payment_id") : null,
                success, success ? null : "Payment failed");

        return ResponseEntity.ok("OK");
    }

    // PayU webhook - reverse-hash verification against PayU's documented formula (see PayuGateway
    // for the "must validate against a real sandbox" caveat - the formula is real, not a stub,
    // but hasn't been tested against a live PayU callback).
    @PostMapping("/webhook/payu")
    public ResponseEntity<String> payuWebhook(
            @RequestParam Map<String, String> formParams) {

        com.marketplace.payment.gateway.PayuGateway payu =
                (com.marketplace.payment.gateway.PayuGateway) gateways.get("payuGateway");

        if (!payu.verifyFormWebhook(formParams)) {
            log.warn("Rejected PayU webhook - signature verification failed");
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body("Invalid signature");
        }

        boolean success = "success".equalsIgnoreCase(formParams.get("status"));
        paymentService.processWebhook(
                formParams.get("txnid"), formParams.get("txnid"), formParams.get("mihpayid"),
                success, success ? null : "Payment failed");

        return ResponseEntity.ok("OK");
    }
}
