package com.marketplace.payout.dto;

import com.marketplace.payout.model.Payout;

import java.math.BigDecimal;
import java.time.Instant;

public record PayoutResponse(
        Long id,
        Long orderId,
        Long vendorId,
        BigDecimal amount,
        String gateway,
        String gatewayTransferId,
        String status,
        String failureReason,
        int retryCount,
        Instant initiatedAt,
        Instant completedAt
) {
    public static PayoutResponse from(Payout payout) {
        return new PayoutResponse(
                payout.getId(),
                payout.getOrderId(),
                payout.getVendorId(),
                payout.getAmount(),
                payout.getGateway().name(),
                payout.getGatewayTransferId(),
                payout.getStatus().name(),
                payout.getFailureReason(),
                payout.getRetryCount(),
                payout.getInitiatedAt(),
                payout.getCompletedAt()
        );
    }
}
