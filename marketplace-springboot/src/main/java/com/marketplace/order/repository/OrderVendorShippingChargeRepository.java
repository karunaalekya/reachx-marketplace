package com.marketplace.order.repository;

import com.marketplace.order.model.OrderVendorShippingCharge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface OrderVendorShippingChargeRepository extends JpaRepository<OrderVendorShippingCharge, Long> {
    List<OrderVendorShippingCharge> findByOrderId(Long orderId);

    Optional<OrderVendorShippingCharge> findByOrderIdAndVendorId(Long orderId, Long vendorId);
}
