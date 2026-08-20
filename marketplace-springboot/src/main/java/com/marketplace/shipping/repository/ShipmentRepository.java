package com.marketplace.shipping.repository;

import com.marketplace.shipping.model.Shipment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {
    List<Shipment> findByOrderId(Long orderId);
    Optional<Shipment> findByAwbNumber(String awbNumber);
    Optional<Shipment> findByOrderIdAndVendorId(Long orderId, Long vendorId);
}
