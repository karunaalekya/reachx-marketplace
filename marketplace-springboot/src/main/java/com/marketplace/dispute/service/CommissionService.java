package com.marketplace.dispute.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.tax.service.TaxWithholdingService;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class CommissionService {

    private final CommissionRecordRepository commissionRecordRepository;
    private final OrderRepository orderRepository;
    private final VendorRepository vendorRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final TaxWithholdingService taxWithholdingService;

    // Triggered by the same order.paid event that drives shipment creation - commission
    // is earned the moment payment succeeds, independent of fulfillment/shipping status.
    @KafkaListener(topics = KafkaTopics.ORDER_PAID, groupId = "commission-service",
            containerFactory = "commissionKafkaListenerContainerFactory")
    @Transactional
    public void onOrderPaid(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        Map<Long, List<OrderItem>> itemsByVendor = order.getItems().stream()
                .collect(Collectors.groupingBy(OrderItem::getVendorId));

        for (Map.Entry<Long, List<OrderItem>> entry : itemsByVendor.entrySet()) {
            Long vendorId = entry.getKey();

            if (commissionRecordRepository.findByOrderIdAndVendorId(orderId, vendorId).isPresent()) {
                log.info("Commission record already exists for orderId={} vendorId={}, skipping", orderId, vendorId);
                continue;
            }

            recordCommission(order, vendorId, entry.getValue());
        }
    }

    private void recordCommission(Order order, Long vendorId, List<OrderItem> items) {
        Vendor vendor = vendorRepository.findById(vendorId)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found with id: " + vendorId));

        BigDecimal grossAmount = items.stream()
                .map(OrderItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // Snapshot the vendor's commission rate at time of sale - a later rate change must not
        // retroactively alter what was already earned/owed on this order.
        BigDecimal rate = vendor.getCommissionRate();
        BigDecimal commissionAmount = grossAmount.multiply(rate)
                .divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP);
        BigDecimal vendorPayout = grossAmount.subtract(commissionAmount);

        // Save first so TCS/TDS filing rows have a real commission_record_id to reference
        // (tax_withholding_records.commission_record_id is a hard FK, not nullable-then-backfilled).
        CommissionRecord record = CommissionRecord.builder()
                .orderId(order.getId())
                .vendorId(vendorId)
                .grossAmount(grossAmount)
                .commissionRate(rate)
                .commissionAmount(commissionAmount)
                .vendorPayoutAmount(vendorPayout)
                .payoutStatus(CommissionRecord.PayoutStatus.PENDING)
                .build();
        record = commissionRecordRepository.save(record);

        // TCS (Sec 52) + TDS (Sec 194-O) - both statutory operator obligations, computed and
        // filed-snapshotted here at the same "payment succeeded" moment everything else in this
        // record gets snapshotted. See TaxWithholdingService for the full legal/rate reasoning.
        TaxWithholdingService.Computation withholding = taxWithholdingService.computeAndRecord(
                record.getId(), order.getId(), vendor, grossAmount, order.getCustomerState());

        BigDecimal netPayable = vendorPayout
                .subtract(withholding.tcsAmount())
                .subtract(withholding.tdsAmount());

        record.setTcsAmount(withholding.tcsAmount());
        record.setTdsAmount(withholding.tdsAmount());
        record.setVendorNetPayable(netPayable);
        record = commissionRecordRepository.save(record);

        log.info("Commission recorded: orderId={} vendorId={} gross={} commission={} tcs={} tds={} netPayable={}",
                order.getId(), vendorId, grossAmount, commissionAmount,
                withholding.tcsAmount(), withholding.tdsAmount(), netPayable);

        kafkaTemplate.send(KafkaTopics.COMMISSION_RECORDED, order.getId().toString(), record.getId());
    }

    public Page<CommissionRecord> findByVendor(Long vendorId, Pageable pageable) {
        return commissionRecordRepository.findByVendorId(vendorId, pageable);
    }

    public BigDecimal getPendingPayoutTotal(Long vendorId) {
        return commissionRecordRepository.sumPendingPayoutForVendor(vendorId);
    }
}
