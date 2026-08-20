package com.marketplace.dispute;

import com.marketplace.dispute.dto.RaiseDisputeRequest;
import com.marketplace.dispute.dto.ResolveDisputeRequest;
import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.model.Dispute;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.dispute.repository.DisputeRepository;
import com.marketplace.dispute.service.DisputeService;
import com.marketplace.refund.model.Refund;
import com.marketplace.refund.service.RefundService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class DisputeServiceTest {

    @Mock private DisputeRepository disputeRepository;
    @Mock private CommissionRecordRepository commissionRecordRepository;
    @Mock private RefundService refundService;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    private DisputeService service() {
        return new DisputeService(disputeRepository, commissionRecordRepository, refundService, kafkaTemplate);
    }

    @Test
    void raise_holdsVendorPayout_whenCommissionRecordExists() {
        CommissionRecord record = CommissionRecord.builder()
                .id(1L).orderId(10L).vendorId(5L)
                .grossAmount(BigDecimal.valueOf(1000)).commissionRate(BigDecimal.TEN)
                .commissionAmount(BigDecimal.valueOf(100)).vendorPayoutAmount(BigDecimal.valueOf(900))
                .payoutStatus(CommissionRecord.PayoutStatus.PENDING)
                .build();

        when(disputeRepository.save(any())).thenAnswer(inv -> {
            Dispute d = inv.getArgument(0);
            d.setId(99L);
            return d;
        });
        when(commissionRecordRepository.findByOrderIdAndVendorId(10L, 5L)).thenReturn(Optional.of(record));

        service().raise(new RaiseDisputeRequest(10L, 5L, "buyer@test.com", "ITEM_DAMAGED", "Box arrived crushed"));

        assertEquals(CommissionRecord.PayoutStatus.HELD_FOR_DISPUTE, record.getPayoutStatus());
        verify(commissionRecordRepository).save(record);
    }

    @Test
    void resolve_releasesPayout_whenDisputeRejected() {
        Dispute dispute = Dispute.builder()
                .id(1L).orderId(10L).vendorId(5L).raisedByEmail("buyer@test.com")
                .category(Dispute.DisputeCategory.OTHER).description("test")
                .status(Dispute.DisputeStatus.OPEN)
                .build();

        CommissionRecord record = CommissionRecord.builder()
                .id(1L).orderId(10L).vendorId(5L)
                .payoutStatus(CommissionRecord.PayoutStatus.HELD_FOR_DISPUTE)
                .build();

        when(disputeRepository.findById(1L)).thenReturn(Optional.of(dispute));
        when(disputeRepository.save(any())).thenReturn(dispute);
        when(commissionRecordRepository.findByOrderIdAndVendorId(10L, 5L)).thenReturn(Optional.of(record));

        service().resolve(1L, 42L, new ResolveDisputeRequest("RESOLVED_REJECTED", "No evidence of damage"));

        assertEquals(CommissionRecord.PayoutStatus.PENDING, record.getPayoutStatus());
        // Rejecting a dispute must never trigger a refund attempt.
        verify(refundService, never()).initiateRefund(anyLong(), anyLong(), anyLong(), anyLong(), anyString());
    }

    @Test
    void resolve_delegatesToRefundService_whenResolvedRefunded() {
        Dispute dispute = Dispute.builder()
                .id(2L).orderId(11L).vendorId(6L).raisedByEmail("buyer2@test.com")
                .category(Dispute.DisputeCategory.ITEM_NOT_RECEIVED).description("never arrived")
                .status(Dispute.DisputeStatus.OPEN)
                .build();

        when(disputeRepository.findById(2L)).thenReturn(Optional.of(dispute));
        when(disputeRepository.save(any())).thenReturn(dispute);
        when(commissionRecordRepository.findByOrderIdAndVendorId(11L, 6L)).thenReturn(Optional.empty());
        when(refundService.initiateRefund(eq(11L), eq(6L), eq(2L), eq(42L), anyString()))
                .thenReturn(Refund.builder().id(1L).orderId(11L).status(Refund.RefundStatus.PROCESSED).build());

        service().resolve(2L, 42L, new ResolveDisputeRequest("RESOLVED_REFUNDED", "Confirmed lost in transit"));

        // The real refund/payout work now happens inside RefundService, not DisputeService -
        // this test verifies DisputeService correctly delegates to it with the right vendor
        // scope, not that DisputeService mutates commission records itself (it no longer does).
        verify(refundService).initiateRefund(eq(11L), eq(6L), eq(2L), eq(42L), anyString());
    }

    @Test
    void resolve_doesNotFailDisputeResolution_whenRefundFails() {
        Dispute dispute = Dispute.builder()
                .id(3L).orderId(12L).vendorId(7L).raisedByEmail("buyer3@test.com")
                .category(Dispute.DisputeCategory.REFUND_REQUEST).description("wants refund")
                .status(Dispute.DisputeStatus.OPEN)
                .build();

        when(disputeRepository.findById(3L)).thenReturn(Optional.of(dispute));
        when(disputeRepository.save(any())).thenReturn(dispute);
        when(commissionRecordRepository.findByOrderIdAndVendorId(12L, 7L)).thenReturn(Optional.empty());
        when(refundService.initiateRefund(eq(12L), eq(7L), eq(3L), eq(42L), anyString()))
                .thenReturn(Refund.builder().id(2L).orderId(12L).status(Refund.RefundStatus.FAILED)
                        .failureReason("PayU refunds not implemented").build());

        // Must not throw - a failed refund is a recorded outcome, not a reason to fail the
        // whole dispute-resolution call (this is exactly the transaction-rollback bug that
        // was fixed: resolve() must complete even when the downstream refund attempt fails).
        service().resolve(3L, 42L, new ResolveDisputeRequest("RESOLVED_REFUNDED", "Approved, refund attempted"));

        verify(disputeRepository).save(any());
    }
}
