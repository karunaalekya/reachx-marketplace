package com.marketplace.order.scheduler;

import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.repository.OrderRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AbandonedOrderExpiryJobTest {

    @Mock private OrderRepository orderRepository;
    @Mock private ProductRepository productRepository;

    private AbandonedOrderExpiryJob job() {
        AbandonedOrderExpiryJob job = new AbandonedOrderExpiryJob(orderRepository, productRepository);
        ReflectionTestUtils.setField(job, "abandonedTimeoutMinutes", 30);
        return job;
    }

    @Test
    void expireAbandonedOrders_restoresStockAndCancels_forStaleOrders() {
        OrderItem item = OrderItem.builder().productId(5L).quantity(3).build();
        Order staleOrder = Order.builder()
                .id(1L).status(Order.OrderStatus.PENDING_PAYMENT).items(List.of(item)).build();

        when(orderRepository.findByStatusAndCreatedAtBefore(eq(Order.OrderStatus.PENDING_PAYMENT), any()))
                .thenReturn(List.of(staleOrder));

        job().expireAbandonedOrders();

        verify(productRepository).incrementStock(5L, 3);
        verify(orderRepository).save(staleOrder);
        assertEquals(Order.OrderStatus.CANCELLED, staleOrder.getStatus());
    }

    @Test
    void expireAbandonedOrders_doesNothing_whenNoStaleOrdersExist() {
        when(orderRepository.findByStatusAndCreatedAtBefore(eq(Order.OrderStatus.PENDING_PAYMENT), any()))
                .thenReturn(List.of());

        job().expireAbandonedOrders();

        verify(productRepository, never()).incrementStock(anyLong(), anyInt());
        verify(orderRepository, never()).save(any());
    }
}
