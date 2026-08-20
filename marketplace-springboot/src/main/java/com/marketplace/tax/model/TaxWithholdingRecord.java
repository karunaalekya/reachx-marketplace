package com.marketplace.tax.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

// Immutable filing snapshot - one row per (commission_record, tax_type). Deliberately does not
// live-read Vendor.state/panNumber for reporting; a vendor editing their state or PAN after the
// fact must not retroactively change what was actually filed for a prior period. See V16
// migration comment for the full reasoning.
@Entity
@Table(name = "tax_withholding_records")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TaxWithholdingRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "commission_record_id", nullable = false)
    private Long commissionRecordId;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type", nullable = false)
    private TaxType taxType;

    @Enumerated(EnumType.STRING)
    @Column(name = "supply_type")
    private SupplyType supplyType;

    @Column(name = "rate_percent", nullable = false)
    private BigDecimal ratePercent;

    @Column(name = "taxable_value", nullable = false)
    private BigDecimal taxableValue;

    @Column(nullable = false)
    private BigDecimal amount;

    @Column(name = "vendor_pan_on_file")
    private String vendorPanOnFile;

    @Column(name = "financial_year", nullable = false)
    private String financialYear;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public enum TaxType { TCS, TDS }
    public enum SupplyType { INTRA_STATE, INTER_STATE }
}
