package com.marketplace.order.dto;

import com.marketplace.order.model.Order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

public record OrderResponse(
        Long id,
        String orderNumber,
        String status,
        BigDecimal subtotalAmount,
        BigDecimal shippingFeeAmount,
        BigDecimal taxAmount,
        BigDecimal totalAmount,
        String customerState,
        List<OrderItemResponse> items,
        Map<Long, BigDecimal> vendorSubtotals,   // vendorId -> that vendor's share of the order
        Instant createdAt
) {
    public record OrderItemResponse(
            Long productId, Long vendorId, String productName,
            BigDecimal unitPrice, Integer quantity, BigDecimal lineTotal
    ) {}

    public static OrderResponse from(Order order) {
        List<OrderItemResponse> itemResponses = order.getItems().stream()
                .map(i -> new OrderItemResponse(
                        i.getProductId(), i.getVendorId(), i.getProductName(),
                        i.getUnitPrice(), i.getQuantity(), i.getLineTotal()))
                .toList();

        Map<Long, BigDecimal> vendorSubtotals = order.getItems().stream()
                .collect(Collectors.groupingBy(
                        com.marketplace.order.model.OrderItem::getVendorId,
                        Collectors.mapping(
                                com.marketplace.order.model.OrderItem::getLineTotal,
                                Collectors.reducing(BigDecimal.ZERO, BigDecimal::add))
                ));

        return new OrderResponse(
                order.getId(), order.getOrderNumber(), order.getStatus().name(),
                order.getSubtotalAmount(), order.getShippingFeeAmount(), order.getTaxAmount(),
                order.getTotalAmount(), order.getCustomerState(),
                itemResponses, vendorSubtotals, order.getCreatedAt()
        );
    }
}
