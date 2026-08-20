package com.marketplace.shipping.dto;

import com.marketplace.shipping.model.Shipment;

import java.time.Instant;

public record ShipmentResponse(
        Long id, Long orderId, Long vendorId,
        String awbNumber, String courierName, String status,
        String failureReason, Instant createdAt, Instant updatedAt
) {
    public static ShipmentResponse from(Shipment s) {
        return new ShipmentResponse(
                s.getId(), s.getOrderId(), s.getVendorId(),
                s.getAwbNumber(), s.getCourierName(), s.getStatus().name(),
                s.getFailureReason(), s.getCreatedAt(), s.getUpdatedAt()
        );
    }
}
