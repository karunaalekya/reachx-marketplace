package com.marketplace.vendor.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;

// One row per (vendor, docType) - see V18__vendor_kyc_documents.sql for why this replaced the
// old single-field model on Vendor (kycDocumentUrl/rejectionReason, one status for the whole
// vendor). vendorId is a plain Long column, not a @ManyToOne to Vendor, matching this codebase's
// existing convention for per-vendor child rows (see OrderVendorShippingCharge) rather than
// introducing a new relational-mapping style into this module.
@Entity
@Table(name = "vendor_kyc_documents")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VendorKycDocument {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "doc_type", nullable = false, length = 32)
    private DocType docType;

    @Column(name = "storage_key", nullable = false, length = 512)
    private String storageKey;

    @Column(name = "document_url", nullable = false, length = 1024)
    private String documentUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    @Builder.Default
    private DocStatus status = DocStatus.PENDING;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "uploaded_at", nullable = false)
    private Instant uploadedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        this.createdAt = now;
        this.updatedAt = now;
        if (this.uploadedAt == null) {
            this.uploadedAt = now;
        }
    }

    @PreUpdate
    void onUpdate() {
        this.updatedAt = Instant.now();
    }

    public enum DocStatus { PENDING, APPROVED, REJECTED }

    // required = true means this doc type counts toward overall KYC approval - see
    // VendorService#recomputeOverallKycStatus. Deliberately NOT counted by a hardcoded number
    // anywhere (that was the exact bug flagged in the earlier, rejected version of this schema -
    // an `approvedCount == 3` check that would silently stop working the moment a type was
    // added here without updating that number elsewhere). Adding a new required type just means
    // adding it to this enum (and to V18's CHECK constraint) - every count derives from this list.
    public enum DocType {
        PAN(true),
        GSTIN(true),
        BANK_CHEQUE(true),
        MSME_CERTIFICATE(false);

        private final boolean required;

        DocType(boolean required) {
            this.required = required;
        }

        public boolean isRequired() {
            return required;
        }
    }
}
