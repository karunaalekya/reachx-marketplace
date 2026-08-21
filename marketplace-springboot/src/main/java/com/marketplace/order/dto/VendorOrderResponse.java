package com.marketplace.order.dto;

import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.shipping.dto.ShipmentResponse;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

// Vendor-scoped view of an order: shows only that vendor's own items, subtotal, and shipment -
// never another vendor's products, prices, or sales sharing the same order.
public record VendorOrderResponse(
        Long orderId,
        String orderNumber,
        String orderStatus,
        List<VendorOrderItem> items,
        BigDecimal vendorSubtotal,
        ShipmentResponse shipment,
        Instant createdAt
) {
    public record VendorOrderItem(
            Long productId, String productName, BigDecimal unitPrice, Integer quantity, BigDecimal lineTotal
    ) {}

    public static VendorOrderResponse from(Order order, Long vendorId, ShipmentResponse shipment) {
        List<OrderItem> vendorItems = order.getItems().stream()
                .filter(i -> i.getVendorId().equals(vendorId))
                .toList();

        List<VendorOrderItem> itemResponses = vendorItems.stream()
                .map(i -> new VendorOrderItem(
                        i.getProductId(), i.getProductName(), i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
                .toList();

        BigDecimal subtotal = vendorItems.stream()
                .map(OrderItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        return new VendorOrderResponse(
                order.getId(), order.getOrderNumber(), order.getStatus().name(),
                itemResponses, subtotal, shipment, order.getCreatedAt()
        );
    }
}
