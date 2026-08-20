package com.marketplace.dispute.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
import com.marketplace.dispute.dto.DisputeResponse;
import com.marketplace.dispute.dto.RaiseDisputeRequest;
import com.marketplace.dispute.dto.ResolveDisputeRequest;
import com.marketplace.dispute.event.DisputeResolvedEvent;
import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.model.Dispute;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.dispute.repository.DisputeRepository;
import com.marketplace.refund.service.RefundService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Service
@RequiredArgsConstructor
@Slf4j
public class DisputeService {

    private final DisputeRepository disputeRepository;
    private final CommissionRecordRepository commissionRecordRepository;
    private final RefundService refundService;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Transactional
    public DisputeResponse raise(RaiseDisputeRequest request) {
        Dispute dispute = Dispute.builder()
                .orderId(request.orderId())
                .vendorId(request.vendorId())
                .raisedByEmail(request.raisedByEmail())
                .category(Dispute.DisputeCategory.valueOf(request.category()))
                .description(request.description())
                .status(Dispute.DisputeStatus.OPEN)
                .build();

        Dispute saved = disputeRepository.save(dispute);
        log.info("Dispute raised: id={} orderId={} vendorId={}", saved.getId(), saved.getOrderId(), saved.getVendorId());

        // A dispute in progress must hold that vendor's payout for this order - paying out
        // before a dispute resolves risks the platform being unable to claw back a refund.
        commissionRecordRepository.findByOrderIdAndVendorId(request.orderId(), request.vendorId())
                .ifPresent(record -> {
                    record.setPayoutStatus(CommissionRecord.PayoutStatus.HELD_FOR_DISPUTE);
                    commissionRecordRepository.save(record);
                    log.info("Commission payout held pending dispute: orderId={} vendorId={}",
                            request.orderId(), request.vendorId());
                });

        kafkaTemplate.send(KafkaTopics.DISPUTE_RAISED, saved.getId().toString(), saved.getId());
        return DisputeResponse.from(saved);
    }

    public Page<DisputeResponse> findByStatus(Dispute.DisputeStatus status, Pageable pageable) {
        return disputeRepository.findByStatus(status, pageable).map(DisputeResponse::from);
    }

    public DisputeResponse getById(Long id) {
        return DisputeResponse.from(findOrThrow(id));
    }

    @Transactional
    public DisputeResponse resolve(Long disputeId, Long adminId, ResolveDisputeRequest request) {
        Dispute dispute = findOrThrow(disputeId);

        if (dispute.getStatus().name().startsWith("RESOLVED")) {
            throw new IllegalStateException("This dispute has already been resolved");
        }

        Dispute.DisputeStatus resolution = Dispute.DisputeStatus.valueOf(request.resolution());
        dispute.setStatus(resolution);
        dispute.setResolutionNotes(request.notes());
        dispute.setResolvedByAdminId(adminId);
        dispute.setResolvedAt(Instant.now());
        Dispute saved = disputeRepository.save(dispute);

        // Release or permanently hold the vendor's payout based on the resolution outcome.
        commissionRecordRepository.findByOrderIdAndVendorId(dispute.getOrderId(), dispute.getVendorId())
                .ifPresent(record -> {
                    if (resolution == Dispute.DisputeStatus.RESOLVED_REJECTED) {
                        // Customer's claim rejected - vendor gets paid as normal.
                        record.setPayoutStatus(CommissionRecord.PayoutStatus.PENDING);
                        commissionRecordRepository.save(record);
                    }
                    // RESOLVED_REFUNDED handled below via RefundService, which sets
                    // CANCELLED_REFUNDED itself once the refund actually processes.
                    // RESOLVED_REPLACED: payout stays HELD_FOR_DISPUTE - a replacement still
                    // needs manual reconciliation (shipping cost of the replacement isn't
                    // modeled), flagged as a follow-up.
                });

        if (resolution == Dispute.DisputeStatus.RESOLVED_REFUNDED) {
            // Actually process the refund now, scoped to only this dispute's vendor (see
            // RefundService for why a full-order refund would be wrong in a multi-vendor cart).
            // initiateRefund no longer throws on gateway failure (see RefundService) - it commits
            // a FAILED Refund record instead, so this dispute-resolution transaction is never at
            // risk of being rolled back by a downstream refund failure. Check the result status
            // to log visibility for admins, without making dispute resolution depend on it.
            com.marketplace.refund.model.Refund refund = refundService.initiateRefund(
                    dispute.getOrderId(), dispute.getVendorId(), dispute.getId(), adminId,
                    "Dispute #" + dispute.getId() + " resolved as refund: " + request.notes());

            if (refund.getStatus() == com.marketplace.refund.model.Refund.RefundStatus.FAILED) {
                log.warn("Dispute {} resolved as refunded, but the refund itself failed and needs " +
                        "manual admin follow-up: reason={}", disputeId, refund.getFailureReason());
            }
        }

        log.info("Dispute resolved: id={} resolution={} adminId={}", disputeId, resolution, adminId);
        kafkaTemplate.send(
                KafkaTopics.DISPUTE_RESOLVED,
                disputeId.toString(),
                new DisputeResolvedEvent(disputeId, dispute.getOrderId(), dispute.getVendorId(),
                        resolution.name(), Instant.now())
        );

        return DisputeResponse.from(saved);
    }

    private Dispute findOrThrow(Long id) {
        return disputeRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Dispute not found with id: " + id));
    }
}
