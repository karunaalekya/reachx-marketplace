package com.marketplace.order.repository;

import com.marketplace.order.model.Order;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByOrderNumber(String orderNumber);
    Optional<Order> findByIdempotencyKey(String idempotencyKey);

    // Orders stuck in PENDING_PAYMENT past a cutoff - stock was decremented for these at
    // creation time and is currently unrecoverable until this query finds them.
    List<Order> findByStatusAndCreatedAtBefore(Order.OrderStatus status, Instant cutoff);

    // Vendor-scoped "my orders" - matches any order containing at least one of this vendor's
    // items. DISTINCT prevents duplicate rows when a vendor has multiple items in one order.
    Page<Order> findDistinctByItems_VendorId(Long vendorId, Pageable pageable);

    // Same vendor-scoped "my orders" match, narrowed to one status - powers Amazon/Flipkart-
    // style tabs (Pending/Shipped/Delivered/etc.) on the frontend.
    Page<Order> findDistinctByItems_VendorIdAndStatus(Long vendorId, Order.OrderStatus status, Pageable pageable);

    // Per-status order counts for a vendor - powers tab badge numbers. Returns only statuses
    // that actually have at least one order; the service layer fills in zero for the rest.
    @Query("SELECT o.status, COUNT(DISTINCT o) FROM Order o JOIN o.items i WHERE i.vendorId = :vendorId GROUP BY o.status")
    List<Object[]> countByVendorGroupedByStatus(@Param("vendorId") Long vendorId);
}
