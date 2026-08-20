package com.marketplace.refund.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
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
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

@Service
@Slf4j
public class RefundService {

    private final RefundRepository refundRepository;
    private final PaymentRepository paymentRepository;
    private final OrderRepository orderRepository;
    private final CommissionRecordRepository commissionRecordRepository;
    private final OrderVendorShippingChargeRepository shippingChargeRepository;
    private final Map<String, PaymentGateway> gateways;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public RefundService(RefundRepository refundRepository, PaymentRepository paymentRepository,
                          OrderRepository orderRepository, CommissionRecordRepository commissionRecordRepository,
                          OrderVendorShippingChargeRepository shippingChargeRepository,
                          Map<String, PaymentGateway> gateways, KafkaTemplate<String, Object> kafkaTemplate) {
        this.refundRepository = refundRepository;
        this.paymentRepository = paymentRepository;
        this.orderRepository = orderRepository;
        this.commissionRecordRepository = commissionRecordRepository;
        this.shippingChargeRepository = shippingChargeRepository;
        this.gateways = gateways;
        this.kafkaTemplate = kafkaTemplate;
    }

    // Called by DisputeService when a dispute is resolved as RESOLVED_REFUNDED. Idempotent -
    // if a refund already exists for this order, returns it rather than double-refunding.
    // vendorId scopes the refund to ONLY that vendor's line items in the order - a disputed
    // item from one vendor in a multi-vendor cart must not refund the whole order's payment,
    // which would incorrectly claw back money owed to other, undisputed vendors.
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public Refund initiateRefund(Long orderId, Long vendorId, Long disputeId, Long adminId, String reason) {
        Optional<Refund> existing = refundRepository.findByOrderId(orderId);
        if (existing.isPresent()) {
            log.info("Refund already exists for orderId={}, skipping duplicate initiation", orderId);
            return existing.get();
        }

        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        if (order.getStatus() != Order.OrderStatus.PAID) {
            throw new IllegalStateException(
                    "Cannot refund an order that is not PAID (current: " + order.getStatus() + ")");
        }

        List<OrderItem> vendorItems = order.getItems().stream()
                .filter(i -> i.getVendorId().equals(vendorId))
                .toList();

        if (vendorItems.isEmpty()) {
            throw new IllegalArgumentException(
                    "Vendor id " + vendorId + " has no items in order " + orderId);
        }

        // Refund only this vendor's share, not the full payment - this is the fix for the
        // previous version, which incorrectly refunded the entire order regardless of how
        // many vendors were involved.
        //
        // This must also include the vendor's OWN shipping charge (OrderVendorShippingCharge,
        // added by V17), not just their items' lineTotals - the customer paid that vendor's
        // shipping fee as part of what this vendor collected, same amount InvoiceService folds
        // into that vendor's invoice total. Without this, a refunded vendor's shipping fee would
        // stay with the platform/vendor even though the customer is being refunded for that
        // vendor's line items entirely.
        BigDecimal itemsTotal = vendorItems.stream()
                .map(OrderItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal shippingFeeAmount = shippingChargeRepository.findByOrderIdAndVendorId(orderId, vendorId)
                .map(OrderVendorShippingCharge::getShippingFeeAmount)
                .orElse(BigDecimal.ZERO);

        BigDecimal refundAmount = itemsTotal.add(shippingFeeAmount);

        Set<Long> allVendorIdsInOrder = order.getItems().stream()
                .map(OrderItem::getVendorId)
                .collect(Collectors.toSet());
        boolean isFullOrderRefund = allVendorIdsInOrder.size() == 1;

        Payment payment = paymentRepository
                .findFirstByOrderIdAndStatusOrderByCreatedAtDesc(orderId, Payment.PaymentStatus.SUCCESS)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No successful payment found for order id: " + orderId));

        Refund refund = Refund.builder()
                .orderId(orderId)
                .paymentId(payment.getId())
                .disputeId(disputeId)
                .gateway(Refund.Gateway.valueOf(payment.getGateway().name()))
                .amount(refundAmount)
                .status(Refund.RefundStatus.INITIATED)
                .initiatedByAdminId(adminId)
                .build();
        refund = refundRepository.save(refund);

        try {
            String gatewayBeanName = payment.getGateway().name().toLowerCase() + "Gateway";
            PaymentGateway gateway = gateways.get(gatewayBeanName);

            // Cashfree refunds are keyed by gateway ORDER id, Razorpay by gateway PAYMENT id -
            // pass whichever the gateway implementation actually expects.
            String referenceId = payment.getGateway() == Payment.Gateway.CASHFREE
                    ? payment.getGatewayOrderId()
                    : payment.getGatewayPaymentId();

            PaymentGateway.RefundResult result = gateway.refund(referenceId, refundAmount, reason);

            refund.setGatewayRefundId(result.gatewayRefundId());
            refund.setStatus(Refund.RefundStatus.PROCESSED);
            refundRepository.save(refund);

            // Only mark the whole order REFUNDED if this vendor was the only one in it -
            // otherwise other vendors' items are still legitimately paid/fulfilling, and the
            // order should reflect that a partial refund happened, not that everything reversed.
            order.setStatus(isFullOrderRefund ? Order.OrderStatus.REFUNDED : Order.OrderStatus.PARTIALLY_REFUNDED);
            orderRepository.save(order);

            commissionRecordRepository.findByOrderIdAndVendorId(orderId, vendorId)
                    .ifPresent(record -> {
                        record.setPayoutStatus(CommissionRecord.PayoutStatus.CANCELLED_REFUNDED);
                        commissionRecordRepository.save(record);
                    });

            log.info("Refund processed successfully: orderId={} vendorId={} gatewayRefundId={} amount={} fullOrder={}",
                    orderId, vendorId, result.gatewayRefundId(), refundAmount, isFullOrderRefund);
            kafkaTemplate.send(KafkaTopics.ORDER_PAYMENT_FAILED, orderId.toString(), "REFUNDED");

        } catch (UnsupportedOperationException e) {
            // PayU's refund isn't built yet (see PayuGateway). Deliberately NOT rethrown:
            // this method is @Transactional, and rethrowing here would mark this transaction
            // rollback-only - discarding the very FAILED status write below that's meant to
            // make the failure visible. A failed refund attempt is an expected outcome to
            // record and report, not an exceptional one to propagate - the caller checks
            // refund.getStatus() instead of catching an exception.
            refund.setStatus(Refund.RefundStatus.FAILED);
            refund.setFailureReason(e.getMessage());
            refund = refundRepository.save(refund);
            log.error("Refund requires manual processing for orderId={}: {}", orderId, e.getMessage());
        } catch (Exception e) {
            refund.setStatus(Refund.RefundStatus.FAILED);
            refund.setFailureReason(e.getMessage());
            refund = refundRepository.save(refund);
            log.error("Refund failed for orderId={}", orderId, e);
        }

        return refund;
    }
}
