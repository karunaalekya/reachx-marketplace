package com.marketplace.payment.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
import com.marketplace.order.model.Order;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.service.OrderService;
import com.marketplace.payment.dto.InitiatePaymentResponse;
import com.marketplace.payment.gateway.PaymentGateway;
import com.marketplace.payment.model.Payment;
import com.marketplace.payment.repository.PaymentRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@Slf4j
public class PaymentService {

    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final OrderService orderService;
    private final Map<String, PaymentGateway> gateways;   // beanName -> gateway, e.g. "razorpayGateway"
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PaymentService(PaymentRepository paymentRepository, OrderRepository orderRepository,
                           OrderService orderService, Map<String, PaymentGateway> gateways,
                           KafkaTemplate<String, Object> kafkaTemplate) {
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.orderService = orderService;
        this.gateways = gateways;
        this.kafkaTemplate = kafkaTemplate;
    }

    private PaymentGateway resolveGateway(Payment.Gateway gateway) {
        String beanName = gateway.name().toLowerCase() + "Gateway";
        PaymentGateway resolved = gateways.get(beanName);
        if (resolved == null) {
            throw new IllegalArgumentException("No gateway implementation registered for: " + gateway);
        }
        return resolved;
    }

    @Transactional
    public InitiatePaymentResponse initiatePayment(Long orderId, Payment.Gateway requestedGateway) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        if (order.getStatus() != Order.OrderStatus.PENDING_PAYMENT) {
            throw new IllegalStateException(
                    "Order is not awaiting payment (current status: " + order.getStatus() + ")");
        }

        PaymentGateway gateway = resolveGateway(requestedGateway);
        PaymentGateway.GatewayOrderResult gatewayResult = gateway.createOrder(
                order.getOrderNumber(), order.getTotalAmount(), "INR");

        Payment payment = Payment.builder()
                .orderId(order.getId())
                .gateway(requestedGateway)
                .gatewayOrderId(gatewayResult.gatewayOrderId())
                .amount(order.getTotalAmount())
                .currency("INR")
                .status(Payment.PaymentStatus.CREATED)
                .build();

        paymentRepository.save(payment);
        log.info("Payment initiated: orderId={} gateway={} gatewayOrderId={}",
                orderId, requestedGateway, gatewayResult.gatewayOrderId());

        return new InitiatePaymentResponse(
                requestedGateway.name(), gatewayResult.gatewayOrderId(),
                order.getTotalAmount(), "INR", gatewayResult.rawResponse());
    }

    // Called by the webhook controller AFTER signature verification has already passed there.
    // This method assumes the caller has already proven the payload is authentically from Razorpay.
    @Transactional
    public void processWebhook(String webhookEventId, String gatewayOrderId,
                                 String gatewayPaymentId, boolean success, String failureReason) {

        // Idempotency check: Razorpay retries webhooks on timeout, and can deliver the same
        // event twice. Without this check, a retried "payment success" webhook would try to
        // mark an already-paid order as paid again - harmless here, but the same pattern
        // elsewhere (e.g. triggering a payout) could double-charge or double-pay someone.
        if (paymentRepository.existsByWebhookEventId(webhookEventId)) {
            log.info("Duplicate webhook ignored: webhookEventId={}", webhookEventId);
            return;
        }

        Payment payment = paymentRepository.findByGatewayOrderId(gatewayOrderId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No payment record for gatewayOrderId: " + gatewayOrderId));

        payment.setWebhookEventId(webhookEventId);
        payment.setGatewayPaymentId(gatewayPaymentId);

        if (success) {
            payment.setStatus(Payment.PaymentStatus.SUCCESS);
            paymentRepository.save(payment);
            orderService.markPaid(payment.getOrderId());
            kafkaTemplate.send(KafkaTopics.ORDER_PAID, payment.getOrderId().toString(), payment.getOrderId());
            log.info("Payment succeeded: orderId={} gatewayPaymentId={}", payment.getOrderId(), gatewayPaymentId);
        } else {
            payment.setStatus(Payment.PaymentStatus.FAILED);
            payment.setFailureReason(failureReason);
            paymentRepository.save(payment);
            orderService.markPaymentFailed(payment.getOrderId(), failureReason);
            kafkaTemplate.send(KafkaTopics.ORDER_PAYMENT_FAILED, payment.getOrderId().toString(), failureReason);
            log.warn("Payment failed: orderId={} reason={}", payment.getOrderId(), failureReason);
        }
    }
}
