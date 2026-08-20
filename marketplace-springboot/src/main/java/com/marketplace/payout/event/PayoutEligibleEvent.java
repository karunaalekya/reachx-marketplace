package com.marketplace.payout.event;

import java.time.Instant;

// Published by ShippingService once a shipment's tracking webhook reports DELIVERED - this is
// the trigger point in the locked payout architecture (PROJECT_STATE.md): collect 100% to the
// primary gateway at checkout, then release each vendor's share only once delivery is confirmed,
// not at swipe-time (which is what made Razorpay Route/Split unsuitable here).
public record PayoutEligibleEvent(Long orderId, Long vendorId, Instant deliveredAt) {}
