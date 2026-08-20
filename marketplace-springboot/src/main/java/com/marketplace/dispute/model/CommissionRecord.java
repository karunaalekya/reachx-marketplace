package com.marketplace.dispute.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "commission_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CommissionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "gross_amount", nullable = false)
    private BigDecimal grossAmount;

    // Snapshotted at the time the order was paid - if the vendor's commission rate changes
    // later, historical records must still reflect the rate that was actually in effect.
    @Column(name = "commission_rate", nullable = false)
    private BigDecimal commissionRate;

    @Column(name = "commission_amount", nullable = false)
    private BigDecimal commissionAmount;

    // Commission-only deduction (gross - commission). Left as-is post-V16 so any existing report
    // reading this field is unaffected - see vendorNetPayable for the field PayoutService
    // actually transfers.
    @Column(name = "vendor_payout_amount", nullable = false)
    private BigDecimal vendorPayoutAmount;

    // TCS (Sec 52 CGST Act) and TDS (Sec 194-O Income Tax Act) - both statutory withholdings
    // this platform, as the e-commerce operator, is obligated to collect/deduct. See
    // TaxWithholdingService and V16 migration comment for the computation and the documented
    // simplifications (TDS always deducted, no per-FY ₹5L threshold check yet).
    @Column(name = "tcs_amount", nullable = false)
    @Builder.Default
    private BigDecimal tcsAmount = BigDecimal.ZERO;

    @Column(name = "tds_amount", nullable = false)
    @Builder.Default
    private BigDecimal tdsAmount = BigDecimal.ZERO;

    // gross_amount - commission_amount - tcs_amount - tds_amount. This is the actual transfer
    // amount PayoutService uses, not vendorPayoutAmount.
    @Column(name = "vendor_net_payable", nullable = false)
    @Builder.Default
    private BigDecimal vendorNetPayable = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "payout_status", nullable = false)
    @Builder.Default
    private PayoutStatus payoutStatus = PayoutStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public enum PayoutStatus { PENDING, PAID_OUT, HELD_FOR_DISPUTE, CANCELLED_REFUNDED }
}
