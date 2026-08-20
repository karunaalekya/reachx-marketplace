package com.marketplace.payout.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "payouts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Payout {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "commission_record_id", nullable = false)
    private Long commissionRecordId;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "vendor_payout_account_id")
    private Long vendorPayoutAccountId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VendorPayoutAccount.Gateway gateway;

    @Column(name = "gateway_transfer_id")
    private String gatewayTransferId;

    @Column(name = "idempotency_key", nullable = false)
    private String idempotencyKey;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private PayoutStatus status = PayoutStatus.PENDING;

    @Column(name = "failure_reason", columnDefinition = "TEXT")
    private String failureReason;

    @Column(name = "initiated_at")
    private Instant initiatedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "retry_count", nullable = false)
    @Builder.Default
    private int retryCount = 0;

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

    // BLOCKED = never sent to the gateway at all (e.g. vendor has no verified payout account) -
    // kept distinct from FAILED (gateway was called and rejected/errored) so ops can tell which
    // fix applies: BLOCKED needs the vendor to complete onboarding, FAILED needs a gateway-level
    // investigation or a manual retry.
    public enum PayoutStatus { PENDING, PROCESSING, COMPLETED, FAILED, BLOCKED }
}
