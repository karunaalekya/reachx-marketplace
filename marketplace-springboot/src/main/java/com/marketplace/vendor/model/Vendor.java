package com.marketplace.vendor.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "vendors")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Vendor {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_name", nullable = false)
    private String businessName;

    @Column(nullable = false, unique = true)
    private String email;

    @Column(nullable = false)
    private String phone;

    @Column(name = "password_hash", nullable = false)
    private String passwordHash;

    private String gstin;

    @Column(name = "pan_number")
    private String panNumber;

    // Derived/overall status, recomputed by VendorService#recomputeOverallKycStatus whenever any
    // individual VendorKycDocument's decision changes - no longer directly admin-set (see V18
    // migration). kycDocumentUrl and rejectionReason were dropped from this entity in V18: with
    // per-document URLs/rejection reasons now living in VendorKycDocument, keeping them here
    // would just be dead, unwritten fields going forward.
    @Enumerated(EnumType.STRING)
    @Column(name = "kyc_status", nullable = false)
    @Builder.Default
    private KycStatus kycStatus = KycStatus.PENDING;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private VendorStatus status = VendorStatus.INACTIVE;

    @Column(name = "commission_rate", nullable = false)
    @Builder.Default
    private BigDecimal commissionRate = new BigDecimal("10.00");

    @Column(name = "address_line1")
    private String addressLine1;

    @Column(name = "address_line2")
    private String addressLine2;

    private String city;
    private String state;
    private String pincode;

    // Identifier for this vendor's pickup location as registered in the Shiprocket dashboard -
    // Shiprocket requires pickup locations to be pre-registered there, not just passed as free text.
    @Column(name = "pickup_location_name")
    private String pickupLocationName;

    @Column(name = "email_verified", nullable = false)
    @Builder.Default
    private boolean emailVerified = false;

    @Column(name = "verification_token_hash")
    private String verificationTokenHash;

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

    public enum KycStatus { PENDING, UNDER_REVIEW, APPROVED, REJECTED }
    public enum VendorStatus { INACTIVE, ACTIVE, SUSPENDED }
}
