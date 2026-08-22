package com.marketplace.refund.repository;

import com.marketplace.refund.model.Refund;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RefundRepository extends JpaRepository<Refund, Long> {
    // Kept for the admin single-refund-per-order lookup (RefundController) where the caller
    // doesn't have a vendorId to scope by - fine there since it's a read, not the idempotency
    // gate. Do NOT use this for idempotency checks - see findByOrderIdAndVendorId below.
    Optional<Refund> findByOrderId(Long orderId);

    // The correct idempotency check - see V20 migration. A refund is unique per (order, vendor),
    // not per order.
    Optional<Refund> findByOrderIdAndVendorId(Long orderId, Long vendorId);

    java.util.List<Refund> findAllByOrderId(Long orderId);

    org.springframework.data.domain.Page<Refund> findByVendorId(
            Long vendorId, org.springframework.data.domain.Pageable pageable);
}
