package com.marketplace.order.model;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "orders")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "order_number", nullable = false, unique = true)
    private String orderNumber;

    @Column(name = "customer_email", nullable = false)
    private String customerEmail;

    @Column(name = "customer_phone", nullable = false)
    private String customerPhone;

    @Column(name = "shipping_address", columnDefinition = "TEXT", nullable = false)
    private String shippingAddress;

    // Structured (not parsed from shippingAddress) specifically so GST invoicing can compare it
    // against the vendor's own state to determine CGST+SGST vs IGST - see InvoiceService.
    // Nullable at the column level for pre-existing orders (V12); new checkouts require it.
    @Column(name = "customer_state")
    private String customerState;

    @Column(name = "subtotal_amount", nullable = false)
    private BigDecimal subtotalAmount;

    @Column(name = "total_amount", nullable = false)
    private BigDecimal totalAmount;

    // Sum of every vendor's shipping charge on this order (see OrderVendorShippingCharge for the
    // per-vendor breakdown) - already folded into totalAmount, not an extra charge on top of it.
    @Column(name = "shipping_fee_amount", nullable = false)
    @Builder.Default
    private BigDecimal shippingFeeAmount = BigDecimal.ZERO;

    // GST embedded within totalAmount (items + shipping, both tax-inclusive by this system's
    // convention - see InvoiceService), extracted for display purposes at checkout. Informational
    // only: it does not change totalAmount, and per-vendor invoice tax is still computed
    // independently by InvoiceService from that vendor's own line items + shipping charge.
    @Column(name = "tax_amount", nullable = false)
    @Builder.Default
    private BigDecimal taxAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    @Builder.Default
    private OrderStatus status = OrderStatus.PENDING_PAYMENT;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<OrderItem> items = new ArrayList<>();

    @Column(name = "idempotency_key")
    private String idempotencyKey;

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

    public enum OrderStatus { PENDING_PAYMENT, PAID, PAYMENT_FAILED, CANCELLED, FULFILLED, REFUNDED, PARTIALLY_REFUNDED }
}
