package com.marketplace.order.repository;

import com.marketplace.order.model.Order;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface OrderRepository extends JpaRepository<Order, Long> {
    Optional<Order> findByOrderNumber(String orderNumber);
    Optional<Order> findByIdempotencyKey(String idempotencyKey);

    // Orders stuck in PENDING_PAYMENT past a cutoff - stock was decremented for these at
    // creation time and is currently unrecoverable until this query finds them.
    List<Order> findByStatusAndCreatedAtBefore(Order.OrderStatus status, Instant cutoff);
}
