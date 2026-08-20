package com.marketplace.dispute.dto;

import com.marketplace.dispute.model.Dispute;

import java.time.Instant;

public record DisputeResponse(
        Long id, Long orderId, Long vendorId, String raisedByEmail,
        String category, String description, String status,
        String resolutionNotes, Instant resolvedAt, Instant createdAt
) {
    public static DisputeResponse from(Dispute d) {
        return new DisputeResponse(
                d.getId(), d.getOrderId(), d.getVendorId(), d.getRaisedByEmail(),
                d.getCategory().name(), d.getDescription(), d.getStatus().name(),
                d.getResolutionNotes(), d.getResolvedAt(), d.getCreatedAt()
        );
    }
}
