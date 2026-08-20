package com.marketplace.payout.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
import com.marketplace.dispute.model.CommissionRecord;
import com.marketplace.dispute.repository.CommissionRecordRepository;
import com.marketplace.payout.event.PayoutEligibleEvent;
import com.marketplace.payout.gateway.PayoutGateway;
import com.marketplace.payout.model.Payout;
import com.marketplace.payout.model.VendorPayoutAccount;
import com.marketplace.payout.repository.PayoutRepository;
import com.marketplace.payout.repository.VendorPayoutAccountRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.Optional;

// Worker for the locked payout architecture (PROJECT_STATE.md): Shiprocket delivery-confirmation
// -> ShippingService publishes payout.eligible -> this service's own consumer group
// ("payout-service") and own DLT -> nets against any dispute/refund hold on that vendor's
// commission record -> calls the active payout gateway.
//
// Deliberately DOES NOT follow the "let real exceptions propagate to Kafka's retry-then-DLT
// handler" pattern used by CommissionService/ShippingService/InvoiceService elsewhere in this
// codebase. Those move data; this moves real money. A Kafka-triggered blind retry after a
// transfer that actually succeeded but failed on a later step (e.g. saving the COMPLETED status)
// would double-pay a vendor - so the gateway call itself is always inside a try/catch that
// records the outcome (COMPLETED/PROCESSING/FAILED) and returns normally, never rethrows. The
// one exception is genuinely missing data (no commission record at all for the event) which
// really is a transient-looking data problem worth Kafka's normal retry - see onPayoutEligible.
@Service
@Slf4j
public class PayoutService {

    private final PayoutRepository payoutRepository;
    private final CommissionRecordRepository commissionRecordRepository;
    private final VendorPayoutAccountRepository payoutAccountRepository;
    private final Map<String, PayoutGateway> gateways;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    public PayoutService(PayoutRepository payoutRepository,
                          CommissionRecordRepository commissionRecordRepository,
                          VendorPayoutAccountRepository payoutAccountRepository,
                          Map<String, PayoutGateway> gateways,
                          KafkaTemplate<String, Object> kafkaTemplate) {
        this.payoutRepository = payoutRepository;
        this.commissionRecordRepository = commissionRecordRepository;
        this.payoutAccountRepository = payoutAccountRepository;
        this.gateways = gateways;
        this.kafkaTemplate = kafkaTemplate;
    }

    @KafkaListener(topics = KafkaTopics.PAYOUT_ELIGIBLE, groupId = "payout-service",
            containerFactory = "payoutKafkaListenerContainerFactory")
    @Transactional
    public void onPayoutEligible(PayoutEligibleEvent event) {
        CommissionRecord commission = commissionRecordRepository
                .findByOrderIdAndVendorId(event.orderId(), event.vendorId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No commission record for orderId=" + event.orderId() + " vendorId=" + event.vendorId()
                                + " - payout cannot proceed without one. This is left to propagate to Kafka's "
                                + "retry/DLT handler since it looks like a genuine ordering problem (delivery "
                                + "confirmed before commission was ever recorded), not a normal outcome."));

        attemptPayout(commission);
    }

    // Netting + payout attempt, extracted so both the Kafka listener and the admin manual-retry
    // endpoint share exactly one code path - a retry must go through the identical checks as the
    // original attempt, not a looser version of them.
    @Transactional
    public Payout attemptPayout(CommissionRecord commission) {
        // The entire netting logic against dispute holds / refunds, per the locked architecture
        // ("nets against any PARTIALLY_REFUNDED/dispute holds on that vendor's commission record
        // before calling Cashfree Payouts"): CommissionRecord.payoutStatus is already the single
        // place DisputeService and RefundService flip to HELD_FOR_DISPUTE / CANCELLED_REFUNDED
        // for exactly this vendor's exactly this order - so "only pay out when PENDING" already
        // is the netting check, with no separate calculation needed here.
        if (commission.getPayoutStatus() != CommissionRecord.PayoutStatus.PENDING) {
            log.info("Skipping payout for commissionRecordId={}: payoutStatus={} (not PENDING - "
                            + "held for dispute, already refunded, or already paid out)",
                    commission.getId(), commission.getPayoutStatus());
            return payoutRepository.findByCommissionRecordId(commission.getId()).orElse(null);
        }

        Optional<Payout> existing = payoutRepository.findByCommissionRecordId(commission.getId());
        if (existing.isPresent() && existing.get().getStatus() != Payout.PayoutStatus.FAILED
                && existing.get().getStatus() != Payout.PayoutStatus.BLOCKED) {
            log.info("Payout already {} for commissionRecordId={}, skipping",
                    existing.get().getStatus(), commission.getId());
            return existing.get();
        }

        Optional<VendorPayoutAccount> account = payoutAccountRepository
                .findByVendorIdAndActiveTrue(commission.getVendorId());

        // vendorNetPayable (gross - commission - TCS - TDS), not vendorPayoutAmount (which is
        // only gross - commission, pre-V16) - TCS/TDS are statutory operator withholdings, not
        // optional deductions, so the vendor never actually receives vendorPayoutAmount once
        // both taxes apply. See TaxWithholdingService / CommissionService.recordCommission.
        Payout payout = existing.orElseGet(() -> Payout.builder()
                .commissionRecordId(commission.getId())
                .orderId(commission.getOrderId())
                .vendorId(commission.getVendorId())
                .amount(commission.getVendorNetPayable())
                .idempotencyKey("payout-" + commission.getId())
                .retryCount(0)
                .build());

        if (existing.isPresent()) {
            payout.setRetryCount(payout.getRetryCount() + 1);
        }

        if (account.isEmpty() || account.get().getBeneficiaryStatus() != VendorPayoutAccount.BeneficiaryStatus.VERIFIED) {
            payout.setStatus(Payout.PayoutStatus.BLOCKED);
            payout.setFailureReason(account.isEmpty()
                    ? "Vendor has not registered a payout account yet"
                    : "Vendor's payout account is not VERIFIED (status: " + account.get().getBeneficiaryStatus() + ")");
            payout.setGateway(account.map(VendorPayoutAccount::getGateway).orElse(VendorPayoutAccount.Gateway.CASHFREE));
            Payout saved = payoutRepository.save(payout);
            log.warn("Payout blocked: commissionRecordId={} vendorId={} reason={}",
                    commission.getId(), commission.getVendorId(), payout.getFailureReason());
            return saved;
        }

        VendorPayoutAccount payoutAccount = account.get();
        payout.setVendorPayoutAccountId(payoutAccount.getId());
        payout.setGateway(payoutAccount.getGateway());
        payout.setInitiatedAt(Instant.now());
        payout = payoutRepository.save(payout);   // persist PENDING/attempt state before calling the gateway

        String gatewayBeanName = payoutAccount.getGateway() == VendorPayoutAccount.Gateway.RAZORPAYX
                ? "razorpayxGateway" : "cashfreePayoutGateway";
        PayoutGateway gateway = gateways.get(gatewayBeanName);

        try {
            PayoutGateway.TransferResult result = gateway.transfer(
                    payoutAccount.getBeneficiaryId(),
                    payout.getAmount(),
                    payout.getIdempotencyKey(),
                    "Marketplace payout - order #" + commission.getOrderId());

            payout.setGatewayTransferId(result.transferId());

            switch (result.status()) {
                case COMPLETED -> {
                    payout.setStatus(Payout.PayoutStatus.COMPLETED);
                    payout.setCompletedAt(Instant.now());
                    commission.setPayoutStatus(CommissionRecord.PayoutStatus.PAID_OUT);
                    commissionRecordRepository.save(commission);
                }
                case PROCESSING, PENDING -> payout.setStatus(Payout.PayoutStatus.PROCESSING);
                // FAILED coming back as a normal (non-exception) gateway response - e.g. the
                // gateway validated the request and rejected it outright (insufficient balance,
                // beneficiary deactivated on their side since we last checked, etc).
                case FAILED -> {
                    payout.setStatus(Payout.PayoutStatus.FAILED);
                    payout.setFailureReason("Gateway reported transfer failed - see gateway_transfer_id "
                            + result.transferId() + " in the provider dashboard for detail");
                }
            }

            Payout saved = payoutRepository.save(payout);
            kafkaTemplate.send(KafkaTopics.PAYOUT_INITIATED, commission.getId().toString(), saved.getId());
            log.info("Payout attempt recorded: commissionRecordId={} vendorId={} amount={} status={}",
                    commission.getId(), commission.getVendorId(), payout.getAmount(), payout.getStatus());
            return saved;

        } catch (Exception e) {
            // See class javadoc: never rethrow here. This attempt's outcome is committed as
            // FAILED and the failure is a normal, expected, recordable outcome for ops to review
            // and manually retry (see PayoutController's admin retry endpoint) - not something
            // to hand back to Kafka's blind retry, which risks a double transfer if the first
            // attempt actually went through at the gateway but the response never made it back
            // here (a network timeout on the way OUT does not mean the transfer didn't happen).
            payout.setStatus(Payout.PayoutStatus.FAILED);
            payout.setFailureReason(e.getMessage());
            Payout saved = payoutRepository.save(payout);
            log.error("Payout attempt failed and requires manual admin review: commissionRecordId={} vendorId={}",
                    commission.getId(), commission.getVendorId(), e);
            return saved;
        }
    }

    // Admin manual retry - re-runs the exact same netting + gateway-call path as the original
    // Kafka-triggered attempt (see attemptPayout), so a dispute raised in the meantime still
    // correctly blocks a retry rather than a looser check letting it slip through.
    @Transactional
    public Payout retry(Long payoutId) {
        Payout payout = payoutRepository.findById(payoutId)
                .orElseThrow(() -> new ResourceNotFoundException("Payout not found with id: " + payoutId));

        if (payout.getStatus() != Payout.PayoutStatus.FAILED && payout.getStatus() != Payout.PayoutStatus.BLOCKED) {
            throw new IllegalStateException(
                    "Only FAILED or BLOCKED payouts can be retried (current status: " + payout.getStatus() + ")");
        }

        CommissionRecord commission = commissionRecordRepository.findById(payout.getCommissionRecordId())
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Commission record not found with id: " + payout.getCommissionRecordId()));

        return attemptPayout(commission);
    }

    // Applies a webhook-reported terminal status update (see PayoutController's Cashfree/
    // RazorpayX webhook endpoints) - a payout that was left PROCESSING after transfer() returned
    // an async-pending status gets its final COMPLETED/FAILED resolved here, asynchronously,
    // once the gateway actually confirms it.
    @Transactional
    public void applyWebhookStatusUpdate(String gatewayTransferId, boolean completed, String failureReason) {
        Payout payout = payoutRepository.findByGatewayTransferId(gatewayTransferId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No payout found for gatewayTransferId: " + gatewayTransferId));

        if (payout.getStatus() == Payout.PayoutStatus.COMPLETED || payout.getStatus() == Payout.PayoutStatus.FAILED) {
            log.info("Ignoring payout webhook for already-terminal payoutId={} (status={})",
                    payout.getId(), payout.getStatus());
            return;
        }

        if (completed) {
            payout.setStatus(Payout.PayoutStatus.COMPLETED);
            payout.setCompletedAt(Instant.now());
            payoutRepository.save(payout);

            commissionRecordRepository.findById(payout.getCommissionRecordId()).ifPresent(commission -> {
                commission.setPayoutStatus(CommissionRecord.PayoutStatus.PAID_OUT);
                commissionRecordRepository.save(commission);
            });
            log.info("Payout confirmed completed via webhook: payoutId={} transferId={}", payout.getId(), gatewayTransferId);
        } else {
            payout.setStatus(Payout.PayoutStatus.FAILED);
            payout.setFailureReason(failureReason);
            payoutRepository.save(payout);
            log.warn("Payout confirmed failed via webhook: payoutId={} transferId={} reason={}",
                    payout.getId(), gatewayTransferId, failureReason);
        }
    }

    public Page<Payout> findByVendor(Long vendorId, Pageable pageable) {
        return payoutRepository.findByVendorId(vendorId, pageable);
    }

    public Page<Payout> findByStatus(Payout.PayoutStatus status, Pageable pageable) {
        return payoutRepository.findByStatus(status, pageable);
    }

    public Page<Payout> findAll(Pageable pageable) {
        return payoutRepository.findAll(pageable);
    }

    public Payout getById(Long id) {
        return payoutRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Payout not found with id: " + id));
    }
}
