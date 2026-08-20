package com.marketplace.payout.gateway;

import java.math.BigDecimal;

// Mirrors payment.gateway.PaymentGateway's shape deliberately - same abstraction pattern
// (interface + one @Component-per-provider bean, resolved by name at the service layer) so
// anyone already familiar with PaymentGateway/RazorpayGateway/CashfreeGateway recognizes this
// immediately rather than learning a second convention for what is conceptually the same kind
// of problem (talk to an external money-movement API, keyed by a provider enum).
public interface PayoutGateway {

    // Registers (or re-registers) a vendor's bank details as a beneficiary/fund-account with
    // the gateway. Gateways validate account-holder-name-vs-bank-records at this step, which is
    // why registration is a separate call from transfer - a bad IFSC or name mismatch should
    // fail loudly here, before any money is scheduled to move, not surface as a payout failure
    // days later.
    BeneficiaryResult registerBeneficiary(BeneficiaryRequest request);

    // Initiates an actual transfer. idempotencyKey MUST be passed through to the gateway's own
    // idempotency mechanism (Cashfree: transfer_id; RazorpayX: reference_id / X-Payout-Idempotency)
    // - this is the second layer of double-payout protection, underneath the payouts.idempotency_key
    // unique DB constraint that PayoutService checks first.
    TransferResult transfer(String beneficiaryId, BigDecimal amount, String idempotencyKey, String remarks);

    // Verifies a payout status-update webhook's signature against the gateway's secret. Payout
    // webhooks use a different secret from that same provider's payment-collection webhooks
    // (different product, different signing key) - never reuse PaymentGateway's verification for
    // this.
    boolean verifyWebhookSignature(String payload, String signatureHeader);

    record BeneficiaryRequest(
            String vendorReference,   // our own vendor id, used as the gateway's external beneficiary id
            String accountHolderName,
            String accountNumber,
            String ifscCode,
            String vpa,
            String email,
            String phone
    ) {}

    record BeneficiaryResult(String beneficiaryId, boolean verified, String rawResponse) {}

    record TransferResult(String transferId, TransferStatus status, String rawResponse) {}

    enum TransferStatus { PENDING, PROCESSING, COMPLETED, FAILED }
}
