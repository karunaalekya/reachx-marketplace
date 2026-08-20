package com.marketplace.order.repository;

import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;

public interface OrderItemRepository extends JpaRepository<OrderItem, Long> {

    // Orders are multi-vendor - vendor_id lives on OrderItem, not Order - so "how many orders
    // has this vendor been part of" always has to go through here, never Order directly.
    // DISTINCT on order id because one vendor can have multiple line items in the same order.
    @Query("""
           SELECT COUNT(DISTINCT oi.order.id) FROM OrderItem oi
           WHERE oi.vendorId = :vendorId AND oi.order.status IN :statuses
           """)
    long countDistinctOrdersByVendorAndStatusIn(
            @Param("vendorId") Long vendorId,
            @Param("statuses") Collection<Order.OrderStatus> statuses
    );
}
