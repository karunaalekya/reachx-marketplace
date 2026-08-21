package com.marketplace.shipping.dto;

import com.marketplace.shipping.model.Shipment;

import java.time.Instant;
import java.util.Set;

public record ShipmentResponse(
        Long id, Long orderId, Long vendorId,
        String awbNumber, String courierName, String status,
        String failureReason, Instant shipByDeadline, boolean overdue,
        Instant createdAt, Instant updatedAt
) {
    // "At risk of missing SLA" only applies before the parcel has actually shipped - once
    // it's SHIPPED/OUT_FOR_DELIVERY/DELIVERED the ship-by deadline is no longer relevant,
    // and FAILED/RTO are a different problem, not a missed-SLA one.
    private static final Set<Shipment.ShipmentStatus> PRE_SHIP_STATUSES = Set.of(
            Shipment.ShipmentStatus.PENDING, Shipment.ShipmentStatus.CREATED,
            Shipment.ShipmentStatus.PICKUP_SCHEDULED
    );

    public static ShipmentResponse from(Shipment s) {
        boolean overdue = s.getShipByDeadline() != null
                && Instant.now().isAfter(s.getShipByDeadline())
                && PRE_SHIP_STATUSES.contains(s.getStatus());

        return new ShipmentResponse(
                s.getId(), s.getOrderId(), s.getVendorId(),
                s.getAwbNumber(), s.getCourierName(), s.getStatus().name(),
                s.getFailureReason(), s.getShipByDeadline(), overdue,
                s.getCreatedAt(), s.getUpdatedAt()
        );
    }
}
