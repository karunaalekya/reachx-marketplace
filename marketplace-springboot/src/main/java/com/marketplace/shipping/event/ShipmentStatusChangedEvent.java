package com.marketplace.shipping.event;

import java.time.Instant;

public record ShipmentStatusChangedEvent(
        Long shipmentId,
        Long orderId,
        Long vendorId,
        String status,
        String awbNumber,
        Instant changedAt
) {}
