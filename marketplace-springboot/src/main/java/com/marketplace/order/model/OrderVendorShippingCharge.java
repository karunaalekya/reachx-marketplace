package com.marketplace.order.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;

// Snapshotted per (order, vendor) at checkout time by ShippingCostCalculator and never
// recalculated afterwards - see V17 migration comment for why (config rate changes must not
// retroactively alter what a past order was actually charged). InvoiceService reads this back to
// fold the vendor's own shipping charge into that vendor's invoice total.
@Entity
@Table(name = "order_vendor_shipping_charges",
        uniqueConstraints = @UniqueConstraint(columnNames = {"order_id", "vendor_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderVendorShippingCharge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_id", nullable = false)
    private Long orderId;

    @Column(name = "vendor_id", nullable = false)
    private Long vendorId;

    @Column(name = "shipping_fee_amount", nullable = false)
    private BigDecimal shippingFeeAmount;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }
}
