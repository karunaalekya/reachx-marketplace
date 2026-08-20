package com.marketplace.config;

public final class KafkaTopics {
    private KafkaTopics() {}

    public static final String VENDOR_REGISTERED = "vendor.registered";
    public static final String VENDOR_KYC_DECIDED = "vendor.kyc.decided";
    public static final String PRODUCT_CREATED = "product.created";
    public static final String PRODUCT_STOCK_UPDATED = "product.stock.updated";
    public static final String ORDER_CREATED = "order.created";
    public static final String ORDER_PAID = "order.paid";
    public static final String ORDER_PAYMENT_FAILED = "order.payment.failed";
    public static final String SHIPMENT_CREATED = "shipment.created";
    public static final String SHIPMENT_STATUS_CHANGED = "shipment.status.changed";
    public static final String DISPUTE_RAISED = "dispute.raised";
    public static final String DISPUTE_RESOLVED = "dispute.resolved";
    public static final String COMMISSION_RECORDED = "commission.recorded";

    // Published by ShippingService once a shipment's tracking webhook reports DELIVERED - see
    // PayoutService for the consumer and PROJECT_STATE.md for the locked payout architecture.
    public static final String PAYOUT_ELIGIBLE = "payout.eligible";
    // Fired after each payout attempt (success, async-pending, or failure) purely for
    // observability/audit trail - no consumer currently depends on it, but it matches this
    // codebase's existing pattern of emitting an event for every real state transition
    // (commission.recorded, shipment.status.changed, etc.) rather than only for ones something
    // currently listens to.
    public static final String PAYOUT_INITIATED = "payout.initiated";
}
