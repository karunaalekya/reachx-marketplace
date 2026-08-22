package com.marketplace.refund.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "refunds")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Refund {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    // Added by V20 - see that migration for why this was missing and what it broke
    // (findByOrderId as the idempotency check meant only one vendor's refund per order could
    // ever exist). Nullable at the entity level to match the migration's deferred NOT NULL on
    // pre-existing multi-vendor rows that couldn't be backfilled unambiguously - every refund
    // created via RefundService from here on always sets it.
    @Column(name = "vendor_id")
    private Long vendorId;

    @Column(name = "payment_id", nullable = false)
    private Long paymentId;

    @Column(name = "dispute_id")
    private Long disputeId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Gateway gateway;

    @Column(name = "gateway_refund_id")
    private String gatewayRefundId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private RefundStatus status = RefundStatus.INITIATED;

    @Column(name = "failure_reason")
    private String failureReason;

    @Column(name = "initiated_by_admin_id")
    private Long initiatedByAdminId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public enum Gateway { RAZORPAY, CASHFREE, PAYU }
    public enum RefundStatus { INITIATED, PROCESSED, FAILED }
}
