package com.marketplace.dispute.model;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "disputes")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Dispute {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "raised_by_email", nullable = false)
    private String raisedByEmail;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DisputeCategory category;

    @Column(columnDefinition = "TEXT", nullable = false)
    private String description;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private DisputeStatus status = DisputeStatus.OPEN;

    @Column(name = "resolution_notes", columnDefinition = "TEXT")
    private String resolutionNotes;

    @Column(name = "resolved_by_admin_id")
    private Long resolvedByAdminId;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

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

    public enum DisputeCategory {
        ITEM_NOT_RECEIVED, ITEM_DAMAGED, ITEM_NOT_AS_DESCRIBED, WRONG_ITEM, REFUND_REQUEST, OTHER
    }

    public enum DisputeStatus {
        OPEN, UNDER_REVIEW, RESOLVED_REFUNDED, RESOLVED_REJECTED, RESOLVED_REPLACED
    }
}
