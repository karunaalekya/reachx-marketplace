package com.marketplace.order.service;

import com.marketplace.catalog.model.Product;
import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.order.dto.CreateOrderRequest;
import com.marketplace.order.dto.OrderResponse;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderVendorShippingCharge;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.repository.OrderVendorShippingChargeRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock private OrderRepository orderRepository;
    @Mock private ProductRepository productRepository;
    @Mock private OrderVendorShippingChargeRepository shippingChargeRepository;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    // Real (not mocked) calculator - a flat, deterministic rule, and exercising the real object
    // here is what actually proves OrderService wires it correctly, not just that some mock
    // returns whatever this test tells it to.
    private final ShippingCostCalculator shippingCostCalculator = new ShippingCostCalculator("49.00", "499.00");

    // Field order must match OrderService's actual constructor (Lombok @RequiredArgsConstructor,
    // generated from declared field order) - see InvoiceServiceTest for why this comment exists.
    private OrderService service() {
        return new OrderService(
                orderRepository, productRepository, shippingChargeRepository,
                shippingCostCalculator, kafkaTemplate);
    }

    private Product product(Long id, Long vendorId, BigDecimal price) {
        return Product.builder()
                .id(id).vendorId(vendorId).name("Widget " + id).slug("widget-" + id)
                .price(price).stockQuantity(100).sku("SKU-" + id)
                .status(Product.ProductStatus.ACTIVE)
                .build();
    }

    private CreateOrderRequest request(CreateOrderRequest.OrderItemRequest... items) {
        return new CreateOrderRequest(
                "buyer@test.com", "9876543210", "123 MG Road", "Karnataka", List.of(items));
    }

    // orderRepository.save is called twice per createOrder (once to obtain an id before shipping
    // charges can be persisted, once more to persist the final totals) - both stubs must return
    // whatever was passed in so the id/items set at the first save survive into the second.
    private void stubSaveEchoesArgument() {
        when(orderRepository.save(any(Order.class))).thenAnswer(inv -> {
            Order order = inv.getArgument(0);
            if (order.getId() == null) {
                order.setId(1L);
            }
            return order;
        });
    }

    @Test
    void createOrder_chargesFlatShipping_whenSingleVendorBelowThreshold() {
        Product product = product(100L, 20L, BigDecimal.valueOf(200));
        when(productRepository.findById(100L)).thenReturn(Optional.of(product));
        when(productRepository.decrementStock(100L, 1)).thenReturn(1);
        stubSaveEchoesArgument();

        OrderResponse response = service().createOrder(
                request(new CreateOrderRequest.OrderItemRequest(100L, 1)), null);

        // subtotal 200 (below 499 free-shipping threshold) -> 49 flat shipping -> total 249
        assertEquals(0, response.subtotalAmount().compareTo(BigDecimal.valueOf(200)));
        assertEquals(0, response.shippingFeeAmount().compareTo(new BigDecimal("49.00")));
        assertEquals(0, response.totalAmount().compareTo(new BigDecimal("249.00")));
    }

    @Test
    void createOrder_waivesShipping_whenVendorSubtotalMeetsFreeThreshold() {
        Product product = product(100L, 20L, BigDecimal.valueOf(600));
        when(productRepository.findById(100L)).thenReturn(Optional.of(product));
        when(productRepository.decrementStock(100L, 1)).thenReturn(1);
        stubSaveEchoesArgument();

        OrderResponse response = service().createOrder(
                request(new CreateOrderRequest.OrderItemRequest(100L, 1)), null);

        assertEquals(0, response.shippingFeeAmount().compareTo(BigDecimal.ZERO));
        assertEquals(0, response.totalAmount().compareTo(BigDecimal.valueOf(600)));
    }

    @Test
    void createOrder_sumsShippingAcrossMultipleVendors_eachEvaluatedOnItsOwnSubtotal() {
        // vendor 20's own subtotal (200) is below threshold -> charged; vendor 30's own
        // subtotal (600) is above it -> free. Each vendor's shipping is earned on its own
        // subtotal, not the order's combined subtotal.
        Product vendor20Product = product(100L, 20L, BigDecimal.valueOf(200));
        Product vendor30Product = product(200L, 30L, BigDecimal.valueOf(600));
        when(productRepository.findById(100L)).thenReturn(Optional.of(vendor20Product));
        when(productRepository.findById(200L)).thenReturn(Optional.of(vendor30Product));
        when(productRepository.decrementStock(100L, 1)).thenReturn(1);
        when(productRepository.decrementStock(200L, 1)).thenReturn(1);
        stubSaveEchoesArgument();

        OrderResponse response = service().createOrder(request(
                new CreateOrderRequest.OrderItemRequest(100L, 1),
                new CreateOrderRequest.OrderItemRequest(200L, 1)), null);

        assertEquals(0, response.subtotalAmount().compareTo(BigDecimal.valueOf(800)));
        // Only vendor 20's flat fee applies; vendor 30 is free.
        assertEquals(0, response.shippingFeeAmount().compareTo(new BigDecimal("49.00")));
        assertEquals(0, response.totalAmount().compareTo(new BigDecimal("849.00")));

        ArgumentCaptor<OrderVendorShippingCharge> chargeCaptor =
                ArgumentCaptor.forClass(OrderVendorShippingCharge.class);
        verify(shippingChargeRepository, times(2)).save(chargeCaptor.capture());
        List<OrderVendorShippingCharge> charges = chargeCaptor.getAllValues();

        assertEquals(1, charges.stream()
                .filter(c -> c.getVendorId().equals(20L))
                .filter(c -> c.getShippingFeeAmount().compareTo(new BigDecimal("49.00")) == 0)
                .count());
        assertEquals(1, charges.stream()
                .filter(c -> c.getVendorId().equals(30L))
                .filter(c -> c.getShippingFeeAmount().compareTo(BigDecimal.ZERO) == 0)
                .count());
    }

    @Test
    void createOrder_computesTaxAmount_asGstExtractedFromShippingInclusiveTotal() {
        // subtotal 200 + shipping 49 = 249 tax-inclusive total at 18% GST.
        // taxable value = 249 / 1.18 = 211.02 (rounded), tax = 249 - 211.02 = 37.98
        Product product = product(100L, 20L, BigDecimal.valueOf(200));
        when(productRepository.findById(100L)).thenReturn(Optional.of(product));
        when(productRepository.decrementStock(100L, 1)).thenReturn(1);
        stubSaveEchoesArgument();

        OrderResponse response = service().createOrder(
                request(new CreateOrderRequest.OrderItemRequest(100L, 1)), null);

        assertEquals(0, response.taxAmount().compareTo(new BigDecimal("37.98")));
    }

    @Test
    void createOrder_doesNotRecalculateShipping_whenReturningExistingOrderForDuplicateIdempotencyKey() {
        Order existing = Order.builder()
                .id(1L).orderNumber("ORD-1").subtotalAmount(BigDecimal.valueOf(200))
                .shippingFeeAmount(new BigDecimal("49.00")).taxAmount(new BigDecimal("37.98"))
                .totalAmount(new BigDecimal("249.00")).items(List.of()).build();
        when(orderRepository.findByIdempotencyKey("key-123")).thenReturn(Optional.of(existing));

        OrderResponse response = service().createOrder(request(), "key-123");

        assertEquals(0, response.totalAmount().compareTo(new BigDecimal("249.00")));
        verify(productRepository, never()).findById(any());
        verify(shippingChargeRepository, never()).save(any());
    }
}
