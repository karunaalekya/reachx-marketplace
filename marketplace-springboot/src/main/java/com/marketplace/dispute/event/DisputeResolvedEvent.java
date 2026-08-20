package com.marketplace.dispute.event;

import java.time.Instant;

public record DisputeResolvedEvent(
        Long disputeId, Long orderId, Long vendorId,
        String resolution, Instant resolvedAt
) {}
