package com.marketplace.payout;

import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.payout.gateway.PayoutGateway;
import com.marketplace.payout.model.Payout;
import com.marketplace.payout.model.VendorPayoutAccount;
import com.marketplace.payout.repository.PayoutRepository;
import com.marketplace.payout.repository.VendorPayoutAccountRepository;
import com.marketplace.payout.service.PayoutService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PayoutServiceTest {

    @Mock private PayoutRepository payoutRepository;
    @Mock private CommissionRecordRepository commissionRecordRepository;
    @Mock private VendorPayoutAccountRepository payoutAccountRepository;
    @Mock private PayoutGateway cashfreePayoutGateway;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    private PayoutService service() {
        return new PayoutService(payoutRepository, commissionRecordRepository, payoutAccountRepository,
                Map.of("cashfreePayoutGateway", cashfreePayoutGateway), kafkaTemplate);
    }

    private CommissionRecord pendingCommission() {
        // vendorNetPayable = gross(1000) - commission(100) - TCS(10, 1%) - TDS(10, 1% w/ PAN) = 880.
        // PayoutService now transfers vendorNetPayable, not vendorPayoutAmount (V16) - see
        // TaxWithholdingService/CommissionService.recordCommission for how these are computed.
        return CommissionRecord.builder()
                .id(50L).orderId(10L).vendorId(1L)
                .grossAmount(BigDecimal.valueOf(1000))
                .commissionRate(BigDecimal.TEN)
                .commissionAmount(BigDecimal.valueOf(100))
                .vendorPayoutAmount(BigDecimal.valueOf(900))
                .tcsAmount(BigDecimal.valueOf(10))
                .tdsAmount(BigDecimal.valueOf(10))
                .vendorNetPayable(BigDecimal.valueOf(880))
                .payoutStatus(CommissionRecord.PayoutStatus.PENDING)
                .build();
    }

    private VendorPayoutAccount verifiedAccount() {
        return VendorPayoutAccount.builder()
                .id(7L).vendorId(1L)
                .accountHolderName("Test Trader")
                .accountNumber("123456789012").accountNumberLast4("9012")
                .ifscCode("HDFC0001234")
                .accountType(VendorPayoutAccount.AccountType.SAVINGS)
                .gateway(VendorPayoutAccount.Gateway.CASHFREE)
                .beneficiaryId("VENDOR-1")
                .beneficiaryStatus(VendorPayoutAccount.BeneficiaryStatus.VERIFIED)
                .active(true)
                .build();
    }

    @Test
    void attemptPayout_skips_whenCommissionIsNotPending() {
        // This IS the netting logic against dispute holds / refunds - see PayoutService javadoc.
        CommissionRecord held = pendingCommission();
        held.setPayoutStatus(CommissionRecord.PayoutStatus.HELD_FOR_DISPUTE);

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.empty());

        Payout result = service().attemptPayout(held);

        assertNull(result);
        verifyNoInteractions(cashfreePayoutGateway);
        verify(payoutRepository, never()).save(any());
    }

    @Test
    void attemptPayout_blocksPayout_whenVendorHasNoVerifiedAccount() {
        CommissionRecord commission = pendingCommission();

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.empty());
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.empty());
        when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Payout result = service().attemptPayout(commission);

        assertEquals(Payout.PayoutStatus.BLOCKED, result.getStatus());
        assertTrue(result.getFailureReason().contains("has not registered"));
        verifyNoInteractions(cashfreePayoutGateway);
    }

    @Test
    void attemptPayout_blocksPayout_whenBeneficiaryNotYetVerified() {
        CommissionRecord commission = pendingCommission();
        VendorPayoutAccount pendingAccount = verifiedAccount();
        pendingAccount.setBeneficiaryStatus(VendorPayoutAccount.BeneficiaryStatus.PENDING);

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.empty());
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.of(pendingAccount));
        when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Payout result = service().attemptPayout(commission);

        assertEquals(Payout.PayoutStatus.BLOCKED, result.getStatus());
        verifyNoInteractions(cashfreePayoutGateway);
    }

    @Test
    void attemptPayout_marksCompleted_andUpdatesCommission_onSuccessfulTransfer() {
        CommissionRecord commission = pendingCommission();
        VendorPayoutAccount account = verifiedAccount();

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.empty());
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.of(account));
        when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(cashfreePayoutGateway.transfer(eq("VENDOR-1"), any(), anyString(), anyString()))
                .thenReturn(new PayoutGateway.TransferResult("cf_transfer_1", PayoutGateway.TransferStatus.COMPLETED, "{}"));

        Payout result = service().attemptPayout(commission);

        assertEquals(Payout.PayoutStatus.COMPLETED, result.getStatus());
        assertEquals(BigDecimal.valueOf(880), result.getAmount());
        assertEquals(CommissionRecord.PayoutStatus.PAID_OUT, commission.getPayoutStatus());
        verify(commissionRecordRepository).save(commission);
        verify(kafkaTemplate).send(anyString(), anyString(), any());
    }

    @Test
    void attemptPayout_recordsFailed_ratherThanThrowing_whenGatewayThrows() {
        // Mirrors RefundService's "never rethrow on gateway failure" pattern, for the same
        // reason: this is @Transactional, and rethrowing would let Kafka blindly retry a call
        // that might have actually succeeded at the gateway before the exception occurred.
        CommissionRecord commission = pendingCommission();
        VendorPayoutAccount account = verifiedAccount();

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.empty());
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.of(account));
        when(payoutRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(cashfreePayoutGateway.transfer(eq("VENDOR-1"), any(), anyString(), anyString()))
                .thenThrow(new RuntimeException("Gateway timeout"));

        Payout result = service().attemptPayout(commission);

        assertEquals(Payout.PayoutStatus.FAILED, result.getStatus());
        assertEquals("Gateway timeout", result.getFailureReason());
        // Commission must stay PENDING (not PAID_OUT) so a later admin retry is still possible.
        assertEquals(CommissionRecord.PayoutStatus.PENDING, commission.getPayoutStatus());
        verify(commissionRecordRepository, never()).save(any());
    }

    @Test
    void attemptPayout_skips_whenAlreadyCompleted_evenIfInvokedAgain() {
        // Idempotency: a redelivered payout.eligible event (Kafka rebalance, offset reset) must
        // never trigger a second transfer for a commission record that's already paid out.
        CommissionRecord commission = pendingCommission();
        Payout existingCompleted = Payout.builder()
                .id(99L).commissionRecordId(50L).orderId(10L).vendorId(1L)
                .amount(BigDecimal.valueOf(900))
                .gateway(VendorPayoutAccount.Gateway.CASHFREE)
                .status(Payout.PayoutStatus.COMPLETED)
                .build();

        when(payoutRepository.findByCommissionRecordId(50L)).thenReturn(Optional.of(existingCompleted));

        Payout result = service().attemptPayout(commission);

        assertEquals(existingCompleted, result);
        verifyNoInteractions(cashfreePayoutGateway);
        verify(payoutRepository, never()).save(any());
    }

    @Test
    void retry_rejectsPayoutsThatAreNotFailedOrBlocked() {
        Payout processingPayout = Payout.builder()
                .id(5L).commissionRecordId(50L)
                .status(Payout.PayoutStatus.PROCESSING)
                .build();

        when(payoutRepository.findById(5L)).thenReturn(Optional.of(processingPayout));

        assertThrows(IllegalStateException.class, () -> service().retry(5L));
        verifyNoInteractions(cashfreePayoutGateway);
    }
}
