package com.marketplace.payout.dto;

import com.marketplace.payout.model.VendorPayoutAccount;

import java.time.Instant;

public record PayoutAccountResponse(
        Long id,
        Long vendorId,
        String accountHolderName,
        String accountNumberMasked,   // "XXXXXXXX1234" - never the real number
        String ifscCode,
        String bankName,
        String accountType,
        String vpa,
        String gateway,
        String beneficiaryStatus,
        String rejectionReason,
        Instant updatedAt
) {
    public static PayoutAccountResponse from(VendorPayoutAccount account) {
        return new PayoutAccountResponse(
                account.getId(),
                account.getVendorId(),
                account.getAccountHolderName(),
                account.getAccountNumberLast4() == null ? null : "XXXXXXXX" + account.getAccountNumberLast4(),
                account.getIfscCode(),
                account.getBankName(),
                account.getAccountType() != null ? account.getAccountType().name() : null,
                account.getVpa(),
                account.getGateway().name(),
                account.getBeneficiaryStatus().name(),
                account.getRejectionReason(),
                account.getUpdatedAt()
        );
    }
}
