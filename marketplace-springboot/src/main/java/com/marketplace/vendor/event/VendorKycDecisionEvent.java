package com.marketplace.vendor.event;

import java.time.Instant;

// Published to Kafka topic "vendor.kyc.decided" whenever an admin approves/rejects a vendor.
// Consumers: notification-service (emails vendor), analytics-service (dashboard counts).
public record VendorKycDecisionEvent(
        Long vendorId,
        String businessName,
        String email,
        boolean approved,
        String rejectionReason,
        Instant decidedAt
) {}
