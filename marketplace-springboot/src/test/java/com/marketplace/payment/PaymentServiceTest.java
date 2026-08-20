package com.marketplace.payment;

import com.marketplace.order.model.Order;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.service.OrderService;
import com.marketplace.payment.gateway.PaymentGateway;
import com.marketplace.payment.model.Payment;
import com.marketplace.payment.repository.PaymentRepository;
import com.marketplace.payment.service.PaymentService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceTest {

    @Mock private PaymentRepository paymentRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private OrderService orderService;
    @Mock private PaymentGateway razorpayGateway;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    private PaymentService paymentService() {
        // PaymentService takes Map<String, PaymentGateway> keyed by bean name (e.g.
        // "razorpayGateway") since it now supports multiple gateways, not a single injected one.
        return new PaymentService(paymentRepository, orderRepository, orderService,
                java.util.Map.of("razorpayGateway", razorpayGateway), kafkaTemplate);
    }

    @Test
    void processWebhook_ignoresDuplicateEvent_evenIfCalledTwice() {
        when(paymentRepository.existsByWebhookEventId("evt_123")).thenReturn(true);

        paymentService().processWebhook("evt_123", "order_abc", "pay_xyz", true, null);

        // Duplicate event never even looks up the payment - proves the idempotency
        // check short-circuits before any state change is attempted.
        verify(paymentRepository, never()).findByGatewayOrderId(anyString());
        verify(orderService, never()).markPaid(anyLong());
    }

    @Test
    void processWebhook_marksOrderPaid_onFirstSuccessfulDelivery() {
        Payment payment = Payment.builder()
                .id(1L).orderId(55L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayOrderId("order_abc").amount(BigDecimal.TEN)
                .status(Payment.PaymentStatus.CREATED)
                .build();

        when(paymentRepository.existsByWebhookEventId("evt_456")).thenReturn(false);
        when(paymentRepository.findByGatewayOrderId("order_abc")).thenReturn(Optional.of(payment));

        paymentService().processWebhook("evt_456", "order_abc", "pay_xyz", true, null);

        ArgumentCaptor<Payment> savedPayment = ArgumentCaptor.forClass(Payment.class);
        verify(paymentRepository).save(savedPayment.capture());
        assertEquals(Payment.PaymentStatus.SUCCESS, savedPayment.getValue().getStatus());
        verify(orderService).markPaid(55L);
    }

    @Test
    void processWebhook_marksOrderPaymentFailed_whenGatewayReportsFailure() {
        Payment payment = Payment.builder()
                .id(2L).orderId(56L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayOrderId("order_def").amount(BigDecimal.TEN)
                .status(Payment.PaymentStatus.CREATED)
                .build();

        when(paymentRepository.existsByWebhookEventId("evt_789")).thenReturn(false);
        when(paymentRepository.findByGatewayOrderId("order_def")).thenReturn(Optional.of(payment));

        paymentService().processWebhook("evt_789", "order_def", "pay_fail", false, "Card declined");

        verify(orderService).markPaymentFailed(56L, "Card declined");
        verify(orderService, never()).markPaid(anyLong());
    }

    @Test
    void initiatePayment_resolvesCorrectGatewayByEnumName() {
        com.marketplace.order.model.Order order = com.marketplace.order.model.Order.builder()
                .id(1L).orderNumber("ORD-1").status(com.marketplace.order.model.Order.OrderStatus.PENDING_PAYMENT)
                .totalAmount(BigDecimal.valueOf(500))
                .build();

        when(orderRepository.findById(1L)).thenReturn(Optional.of(order));
        when(razorpayGateway.createOrder("ORD-1", BigDecimal.valueOf(500), "INR"))
                .thenReturn(new PaymentGateway.GatewayOrderResult("order_rzp_1", "{}"));

        var response = paymentService().initiatePayment(1L, Payment.Gateway.RAZORPAY);

        assertEquals("RAZORPAY", response.gateway());
        assertEquals("order_rzp_1", response.gatewayReference());
        verify(razorpayGateway).createOrder("ORD-1", BigDecimal.valueOf(500), "INR");
    }

    @Test
    void initiatePayment_throwsForUnregisteredGateway() {
        com.marketplace.order.model.Order order = com.marketplace.order.model.Order.builder()
                .id(2L).orderNumber("ORD-2").status(com.marketplace.order.model.Order.OrderStatus.PENDING_PAYMENT)
                .totalAmount(BigDecimal.valueOf(200))
                .build();
        when(orderRepository.findById(2L)).thenReturn(Optional.of(order));

        // PAYU isn't in the test's gateway Map (only razorpayGateway is registered), proving
        // resolveGateway fails clearly instead of silently falling back to the wrong gateway.
        assertThrows(IllegalArgumentException.class,
                () -> paymentService().initiatePayment(2L, Payment.Gateway.PAYU));
    }
}
