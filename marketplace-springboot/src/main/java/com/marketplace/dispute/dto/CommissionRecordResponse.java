package com.marketplace.dispute.dto;

import com.marketplace.dispute.model.CommissionRecord;

import java.math.BigDecimal;
import java.time.Instant;

public record CommissionRecordResponse(
        Long id, Long orderId, Long vendorId, BigDecimal grossAmount,
        BigDecimal commissionRate, BigDecimal commissionAmount,
        BigDecimal vendorPayoutAmount, BigDecimal tcsAmount, BigDecimal tdsAmount,
        BigDecimal vendorNetPayable, String payoutStatus, Instant createdAt
) {
    public static CommissionRecordResponse from(CommissionRecord r) {
        return new CommissionRecordResponse(
                r.getId(), r.getOrderId(), r.getVendorId(), r.getGrossAmount(),
                r.getCommissionRate(), r.getCommissionAmount(), r.getVendorPayoutAmount(),
                r.getTcsAmount(), r.getTdsAmount(), r.getVendorNetPayable(),
                r.getPayoutStatus().name(), r.getCreatedAt()
        );
    }
}
