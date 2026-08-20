package com.marketplace.payout.model;

import com.marketplace.common.security.AesGcmStringConverter;
import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

@Entity
@Table(name = "vendor_payout_accounts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class VendorPayoutAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "account_holder_name", nullable = false)
    private String accountHolderName;

    // Encrypted at rest (AES/GCM) - see AesGcmStringConverter. Explicitly opted in per-field
    // (not @Convert(autoApply = true) at the class level) so it's obvious from reading this
    // entity exactly which field is encrypted.
    @Convert(converter = AesGcmStringConverter.class)
    @Column(name = "account_number", nullable = false, length = 512)
    private String accountNumber;

    // Plaintext, deliberately - only ever used for vendor-facing display ("Account ending 4321")
    // so the UI never needs to decrypt the real number just to show a masked hint.
    @Column(name = "account_number_last4", nullable = false, length = 4)
    private String accountNumberLast4;

    @Column(name = "ifsc_code", nullable = false, length = 11)
    private String ifscCode;

    @Column(name = "bank_name")
    private String bankName;

    @Enumerated(EnumType.STRING)
    @Column(name = "account_type", nullable = false)
    private AccountType accountType;

    // Optional - RazorpayX fund accounts can be created against a VPA instead of account+IFSC.
    @Column(name = "vpa")
    private String vpa;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private Gateway gateway;

    @Column(name = "beneficiary_id")
    private String beneficiaryId;

    @Enumerated(EnumType.STRING)
    @Column(name = "beneficiary_status", nullable = false)
    @Builder.Default
    private BeneficiaryStatus beneficiaryStatus = BeneficiaryStatus.PENDING;

    @Column(name = "rejection_reason", columnDefinition = "TEXT")
    private String rejectionReason;

    @Column(name = "is_active", nullable = false)
    @Builder.Default
    private boolean active = true;

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

    public enum AccountType { SAVINGS, CURRENT }
    public enum Gateway { CASHFREE, RAZORPAYX }
    public enum BeneficiaryStatus { PENDING, VERIFIED, REJECTED }
}
