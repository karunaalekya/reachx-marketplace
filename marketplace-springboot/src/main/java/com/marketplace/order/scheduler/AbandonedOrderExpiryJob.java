package com.marketplace.order.scheduler;

import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.repository.OrderRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class AbandonedOrderExpiryJob {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;

    // How long an order can sit in PENDING_PAYMENT before it's considered abandoned. 30 minutes
    // is generous for a real checkout flow (payment gateways typically time out well before
    // this) while still being short enough that stock doesn't stay locked for hours on a
    // cart someone opened and walked away from.
    @Value("${orders.abandoned-timeout-minutes:30}")
    private int abandonedTimeoutMinutes;

    // Runs every 5 minutes. This is a real scheduled job, not a manual trigger - it needs to
    // exist because stock is decremented eagerly at order creation (see OrderService), which
    // means an abandoned checkout otherwise holds that stock hostage indefinitely.
    @Scheduled(fixedRate = 5, timeUnit = java.util.concurrent.TimeUnit.MINUTES)
    @Transactional
    public void expireAbandonedOrders() {
        Instant cutoff = Instant.now().minus(abandonedTimeoutMinutes, ChronoUnit.MINUTES);
        List<Order> staleOrders = orderRepository.findByStatusAndCreatedAtBefore(
                Order.OrderStatus.PENDING_PAYMENT, cutoff);

        if (staleOrders.isEmpty()) {
            return;
        }

        log.info("Expiring {} abandoned order(s) older than {} minutes", staleOrders.size(), abandonedTimeoutMinutes);

        for (Order order : staleOrders) {
            for (OrderItem item : order.getItems()) {
                productRepository.incrementStock(item.getProductId(), item.getQuantity());
            }
            order.setStatus(Order.OrderStatus.CANCELLED);
            orderRepository.save(order);
            log.info("Order expired and stock restored: orderNumber={}", order.getOrderNumber());
        }
    }
}
