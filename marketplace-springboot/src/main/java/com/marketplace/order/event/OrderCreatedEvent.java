package com.marketplace.order.event;

import java.math.BigDecimal;
import java.time.Instant;

// Published to "order.created" once an order + Razorpay payment intent exist.
// Consumers: none yet in this scope - reserved for inventory-hold / abandoned-cart services later.
public record OrderCreatedEvent(
        Long orderId,
        String orderNumber,
        String customerEmail,
        BigDecimal totalAmount,
        Instant createdAt
) {}
