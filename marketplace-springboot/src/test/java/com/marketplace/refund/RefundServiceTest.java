package com.marketplace.refund;

import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.model.OrderVendorShippingCharge;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.repository.OrderVendorShippingChargeRepository;
import com.marketplace.payment.gateway.PaymentGateway;
import com.marketplace.payment.model.Payment;
import com.marketplace.payment.repository.PaymentRepository;
import com.marketplace.refund.model.Refund;
import com.marketplace.refund.repository.RefundRepository;
import com.marketplace.refund.service.RefundService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class RefundServiceTest {

    @Mock private RefundRepository refundRepository;
    @Mock private PaymentRepository paymentRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private CommissionRecordRepository commissionRecordRepository;
    @Mock private OrderVendorShippingChargeRepository shippingChargeRepository;
    @Mock private PaymentGateway razorpayGateway;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    private RefundService service() {
        return new RefundService(refundRepository, paymentRepository, orderRepository,
                commissionRecordRepository, shippingChargeRepository,
                Map.of("razorpayGateway", razorpayGateway), kafkaTemplate);
    }

    @Test
    void refund_onlyChargesDisputedVendorsShare_inMultiVendorOrder() {
        OrderItem vendorAItem = OrderItem.builder().vendorId(1L).lineTotal(BigDecimal.valueOf(300)).build();
        OrderItem vendorBItem = OrderItem.builder().vendorId(2L).lineTotal(BigDecimal.valueOf(700)).build();

        Order order = Order.builder()
                .id(10L).status(Order.OrderStatus.PAID)
                .items(List.of(vendorAItem, vendorBItem))
                .build();

        Payment payment = Payment.builder()
                .id(5L).orderId(10L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayPaymentId("pay_xyz").amount(BigDecimal.valueOf(1000))
                .status(Payment.PaymentStatus.SUCCESS)
                .build();

        when(refundRepository.findByOrderIdAndVendorId(10L, 1L)).thenReturn(Optional.empty());
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(paymentRepository.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(10L, Payment.PaymentStatus.SUCCESS))
                .thenReturn(Optional.of(payment));
        when(shippingChargeRepository.findByOrderIdAndVendorId(10L, 1L)).thenReturn(Optional.empty());
        when(refundRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(razorpayGateway.refund(eq("pay_xyz"), any(), anyString()))
                .thenReturn(new PaymentGateway.RefundResult("rfnd_123", "{}"));

        service().initiateRefund(10L, 1L, 99L, 42L, "test dispute refund");

        // Only vendor 1's 300, not the full 1000 payment.
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(razorpayGateway).refund(eq("pay_xyz"), amountCaptor.capture(), anyString());
        assertEquals(BigDecimal.valueOf(300), amountCaptor.getValue());

        // Two vendors in the order - refunding one must be PARTIALLY_REFUNDED, not REFUNDED.
        assertEquals(Order.OrderStatus.PARTIALLY_REFUNDED, order.getStatus());
    }

    @Test
    void refund_marksFullyRefunded_whenOnlyOneVendorInOrder() {
        OrderItem soleItem = OrderItem.builder().vendorId(1L).lineTotal(BigDecimal.valueOf(500)).build();
        Order order = Order.builder().id(11L).status(Order.OrderStatus.PAID).items(List.of(soleItem)).build();

        Payment payment = Payment.builder()
                .id(6L).orderId(11L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayPaymentId("pay_abc").amount(BigDecimal.valueOf(500))
                .status(Payment.PaymentStatus.SUCCESS)
                .build();

        when(refundRepository.findByOrderIdAndVendorId(11L, 1L)).thenReturn(Optional.empty());
        when(orderRepository.findById(11L)).thenReturn(Optional.of(order));
        when(paymentRepository.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(11L, Payment.PaymentStatus.SUCCESS))
                .thenReturn(Optional.of(payment));
        when(shippingChargeRepository.findByOrderIdAndVendorId(11L, 1L)).thenReturn(Optional.empty());
        when(refundRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(razorpayGateway.refund(eq("pay_abc"), any(), anyString()))
                .thenReturn(new PaymentGateway.RefundResult("rfnd_456", "{}"));

        service().initiateRefund(11L, 1L, 100L, 42L, "single vendor refund");

        assertEquals(Order.OrderStatus.REFUNDED, order.getStatus());
    }

    @Test
    void refund_returnsFailedRefund_ratherThanThrowing_whenGatewayFails() {
        // This is the fix for the transaction-rollback bug: initiateRefund previously rethrew
        // after saving a FAILED status, which - because this method is @Transactional - would
        // mark the whole transaction (including the caller's dispute-resolution save) rollback-
        // only, silently discarding both. Now it must return normally with FAILED status instead.
        OrderItem item = OrderItem.builder().vendorId(1L).lineTotal(BigDecimal.valueOf(400)).build();
        Order order = Order.builder().id(12L).status(Order.OrderStatus.PAID).items(List.of(item)).build();

        Payment payment = Payment.builder()
                .id(7L).orderId(12L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayPaymentId("pay_fail").amount(BigDecimal.valueOf(400))
                .status(Payment.PaymentStatus.SUCCESS)
                .build();

        when(refundRepository.findByOrderIdAndVendorId(12L, 1L)).thenReturn(Optional.empty());
        when(orderRepository.findById(12L)).thenReturn(Optional.of(order));
        when(paymentRepository.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(12L, Payment.PaymentStatus.SUCCESS))
                .thenReturn(Optional.of(payment));
        when(shippingChargeRepository.findByOrderIdAndVendorId(12L, 1L)).thenReturn(Optional.empty());
        when(refundRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(razorpayGateway.refund(eq("pay_fail"), any(), anyString()))
                .thenThrow(new RuntimeException("Gateway timeout"));

        Refund result = service().initiateRefund(12L, 1L, 101L, 42L, "gateway will fail");

        assertEquals(Refund.RefundStatus.FAILED, result.getStatus());
        // Order status must NOT be marked REFUNDED when the gateway call actually failed.
        assertEquals(Order.OrderStatus.PAID, order.getStatus());
    }

    @Test
    void refund_includesVendorsOwnShippingCharge_notJustItemLineTotals() {
        // Regression test for the bug where refundAmount was computed purely from
        // OrderItem::getLineTotal, silently dropping the vendor's own shipping fee
        // (OrderVendorShippingCharge, V17) that the customer actually paid this vendor.
        OrderItem soleItem = OrderItem.builder().vendorId(1L).lineTotal(BigDecimal.valueOf(500)).build();
        Order order = Order.builder().id(13L).status(Order.OrderStatus.PAID).items(List.of(soleItem)).build();

        Payment payment = Payment.builder()
                .id(8L).orderId(13L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayPaymentId("pay_ship").amount(BigDecimal.valueOf(560))
                .status(Payment.PaymentStatus.SUCCESS)
                .build();

        OrderVendorShippingCharge shippingCharge = OrderVendorShippingCharge.builder()
                .orderId(13L).vendorId(1L).shippingFeeAmount(BigDecimal.valueOf(60))
                .build();

        when(refundRepository.findByOrderIdAndVendorId(13L, 1L)).thenReturn(Optional.empty());
        when(orderRepository.findById(13L)).thenReturn(Optional.of(order));
        when(paymentRepository.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(13L, Payment.PaymentStatus.SUCCESS))
                .thenReturn(Optional.of(payment));
        when(shippingChargeRepository.findByOrderIdAndVendorId(13L, 1L)).thenReturn(Optional.of(shippingCharge));
        when(refundRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(razorpayGateway.refund(eq("pay_ship"), any(), anyString()))
                .thenReturn(new PaymentGateway.RefundResult("rfnd_789", "{}"));

        service().initiateRefund(13L, 1L, 102L, 42L, "shipping should be included");

        // 500 lineTotal + 60 shipping = 560, not just the 500 item total.
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(razorpayGateway).refund(eq("pay_ship"), amountCaptor.capture(), anyString());
        assertEquals(BigDecimal.valueOf(560), amountCaptor.getValue());
    }

    @Test
    void refund_inMultiVendorOrder_onlyIncludesThatVendorsOwnShippingCharge() {
        // Vendor A's shipping fee must not leak into vendor B's refund, or vice versa - each
        // vendor's shipping charge is scoped by (order_id, vendor_id), same granularity as the
        // item filtering already tested above.
        OrderItem vendorAItem = OrderItem.builder().vendorId(1L).lineTotal(BigDecimal.valueOf(300)).build();
        OrderItem vendorBItem = OrderItem.builder().vendorId(2L).lineTotal(BigDecimal.valueOf(700)).build();

        Order order = Order.builder()
                .id(14L).status(Order.OrderStatus.PAID)
                .items(List.of(vendorAItem, vendorBItem))
                .build();

        Payment payment = Payment.builder()
                .id(9L).orderId(14L).gateway(Payment.Gateway.RAZORPAY)
                .gatewayPaymentId("pay_multi").amount(BigDecimal.valueOf(1050))
                .status(Payment.PaymentStatus.SUCCESS)
                .build();

        OrderVendorShippingCharge vendorAShipping = OrderVendorShippingCharge.builder()
                .orderId(14L).vendorId(1L).shippingFeeAmount(BigDecimal.valueOf(20))
                .build();

        when(refundRepository.findByOrderIdAndVendorId(14L, 1L)).thenReturn(Optional.empty());
        when(orderRepository.findById(14L)).thenReturn(Optional.of(order));
        when(paymentRepository.findFirstByOrderIdAndStatusOrderByCreatedAtDesc(14L, Payment.PaymentStatus.SUCCESS))
                .thenReturn(Optional.of(payment));
        when(shippingChargeRepository.findByOrderIdAndVendorId(14L, 1L)).thenReturn(Optional.of(vendorAShipping));
        when(refundRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(razorpayGateway.refund(eq("pay_multi"), any(), anyString()))
                .thenReturn(new PaymentGateway.RefundResult("rfnd_321", "{}"));

        service().initiateRefund(14L, 1L, 103L, 42L, "only vendor A's shipping");

        // 300 (vendor A's items) + 20 (vendor A's shipping) = 320 - vendor B's 700 and vendor B's
        // (unmocked/absent) shipping charge must not be touched or included.
        ArgumentCaptor<BigDecimal> amountCaptor = ArgumentCaptor.forClass(BigDecimal.class);
        verify(razorpayGateway).refund(eq("pay_multi"), amountCaptor.capture(), anyString());
        assertEquals(BigDecimal.valueOf(320), amountCaptor.getValue());
        verify(shippingChargeRepository, never()).findByOrderIdAndVendorId(14L, 2L);
    }
}
