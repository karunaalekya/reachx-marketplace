package com.marketplace.vendor.dto;

// v1 formula - a simple, documented, adjustable weighting, not a statistically derived model.
// Revisit the weights/penalties in AccountHealthService once there's enough real order/dispute
// volume to calibrate against; right now this is deliberately conservative and explainable
// rather than clever.
public record AccountHealthResponse(
        int overallScore,      // 0-100
        String rating,         // EXCELLENT / GOOD / NEEDS_ATTENTION / AT_RISK
        int kycScore,          // 0-100, from Vendor.kycStatus
        int fulfilmentScore,   // 0-100, FULFILLED orders / (FULFILLED + REFUNDED + PARTIALLY_REFUNDED)
        int disputeScore       // 0-100, 100 minus a flat penalty per open/under-review dispute
) {}
