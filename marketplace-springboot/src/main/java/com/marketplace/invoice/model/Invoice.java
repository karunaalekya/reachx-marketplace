package com.marketplace.invoice.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

@Entity
@Table(name = "invoices")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "invoice_number", nullable = false, unique = true)
    private String invoiceNumber;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "shipment_id", nullable = false)
    private Long shipmentId;

    @Column(name = "financial_year", nullable = false)
    private String financialYear;

    @Column(name = "sequence_number", nullable = false)
    private Integer sequenceNumber;

    // Snapshotted at generation time deliberately - see V13 migration comment. A vendor or
    // customer's state changing later must not retroactively alter a already-issued invoice.
    @Column(name = "vendor_state")
    private String vendorState;

    @Column(name = "customer_state")
    private String customerState;

    @Enumerated(EnumType.STRING)
    @Column(name = "tax_type", nullable = false)
    private TaxType taxType;

    @Column(name = "tax_rate_percent", nullable = false)
    private BigDecimal taxRatePercent;

    @Column(name = "taxable_value", nullable = false)
    private BigDecimal taxableValue;

    // This vendor's own shipping charge on the order (see OrderVendorShippingCharge), already
    // folded into taxableValue/totalAmount below - not an extra amount on top of them. Zero for
    // invoices generated before this field existed or for orders with no shipping charge.
    @Column(name = "shipping_fee_amount", nullable = false)
    @Builder.Default
    private BigDecimal shippingFeeAmount = BigDecimal.ZERO;

    @Column(name = "cgst_amount", nullable = false)
    @Builder.Default
    private BigDecimal cgstAmount = BigDecimal.ZERO;

    @Column(name = "sgst_amount", nullable = false)
    @Builder.Default
    private BigDecimal sgstAmount = BigDecimal.ZERO;

    @Column(name = "igst_amount", nullable = false)
    @Builder.Default
    private BigDecimal igstAmount = BigDecimal.ZERO;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    @Column(name = "pdf_url", nullable = false)
    private String pdfUrl;

    @Column(name = "storage_key", nullable = false)
    private String storageKey;

    @Column(name = "generated_at", nullable = false)
    private Instant generatedAt;

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

    public enum TaxType { CGST_SGST, IGST }
}
