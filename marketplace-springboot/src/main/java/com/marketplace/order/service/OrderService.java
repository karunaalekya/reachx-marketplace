package com.marketplace.order.service;

import com.marketplace.catalog.model.Product;
import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.common.exception.InsufficientStockException;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.util.GstExtractor;
import com.marketplace.config.KafkaTopics;
import com.marketplace.order.dto.CreateOrderRequest;
import com.marketplace.order.dto.OrderResponse;
import com.marketplace.order.event.OrderCreatedEvent;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.model.OrderVendorShippingCharge;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.repository.OrderVendorShippingChargeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.format.DateTimeFormatter;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class OrderService {

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final OrderVendorShippingChargeRepository shippingChargeRepository;
    private final ShippingCostCalculator shippingCostCalculator;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd").withZone(ZoneOffset.UTC);
    private static final SecureRandom RANDOM = new SecureRandom();

    // Same flat rate InvoiceService uses for output GST - see that class's comment on why this
    // isn't per-HSN-code. Kept as a separate constant (not imported from InvoiceService) so the
    // two modules don't end up compile-coupled over what is, for now, a coincidentally shared
    // number - if per-category rates arrive later they're very likely to diverge per module.
    private static final BigDecimal GST_RATE_PERCENT = new BigDecimal("18.00");

    // Groups a vendor's own line items into a single subtotal - shipping is charged and
    // free-shipping thresholds are earned per vendor (per parcel), not per whole order.
    private record VendorLineGroup(Long vendorId, BigDecimal subtotal) {}

    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request, String idempotencyKey) {
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            Optional<Order> existing = orderRepository.findByIdempotencyKey(idempotencyKey);
            if (existing.isPresent()) {
                // Same key seen before - return the original order instead of creating a
                // second one. This is what actually prevents a double-click or a network
                // retry from double-decrementing stock, not just returning a nicer error.
                log.info("Duplicate order creation prevented by idempotency key: {}", idempotencyKey);
                return OrderResponse.from(existing.get());
            }
        }

        Order order = Order.builder()
                .orderNumber(generateOrderNumber())
                .customerEmail(request.customerEmail())
                .customerPhone(request.customerPhone())
                .shippingAddress(request.shippingAddress())
                .customerState(request.customerState())
                .idempotencyKey(idempotencyKey)
                .status(Order.OrderStatus.PENDING_PAYMENT)
                .subtotalAmount(BigDecimal.ZERO)
                .totalAmount(BigDecimal.ZERO)
                .build();

        BigDecimal runningTotal = BigDecimal.ZERO;

        for (CreateOrderRequest.OrderItemRequest itemReq : request.items()) {
            Product product = productRepository.findById(itemReq.productId())
                    .orElseThrow(() -> new ResourceNotFoundException(
                            "Product not found with id: " + itemReq.productId()));

            if (product.getStatus() != Product.ProductStatus.ACTIVE) {
                throw new IllegalStateException(
                        "Product '" + product.getName() + "' is not currently available for purchase");
            }

            // Atomic conditional decrement - see ProductRepository.decrementStock for why this
            // matters under concurrent checkouts. 0 rows updated = someone else got there first.
            int rowsUpdated = productRepository.decrementStock(product.getId(), itemReq.quantity());
            if (rowsUpdated == 0) {
                throw new InsufficientStockException(
                        "Insufficient stock for '" + product.getName() + "' - only "
                                + product.getStockQuantity() + " left");
            }

            BigDecimal lineTotal = product.getPrice().multiply(BigDecimal.valueOf(itemReq.quantity()));
            runningTotal = runningTotal.add(lineTotal);

            OrderItem item = OrderItem.builder()
                    .order(order)
                    .productId(product.getId())
                    .vendorId(product.getVendorId())
                    .productName(product.getName())
                    .unitPrice(product.getPrice())
                    .quantity(itemReq.quantity())
                    .lineTotal(lineTotal)
                    .build();

            order.getItems().add(item);
        }

        order.setSubtotalAmount(runningTotal);
        order.setTotalAmount(runningTotal);

        // Saved once here (before shipping) so items/order have a real id - the shipping charge
        // rows below are keyed on that order id and can't be computed before it exists.
        Order saved = orderRepository.save(order);

        List<VendorLineGroup> vendorGroups = saved.getItems().stream()
                .collect(Collectors.groupingBy(OrderItem::getVendorId,
                        Collectors.reducing(BigDecimal.ZERO, OrderItem::getLineTotal, BigDecimal::add)))
                .entrySet().stream()
                .map(e -> new VendorLineGroup(e.getKey(), e.getValue()))
                .toList();

        BigDecimal totalShippingFee = BigDecimal.ZERO;
        for (VendorLineGroup group : vendorGroups) {
            BigDecimal vendorShippingFee = shippingCostCalculator.calculateForVendor(group.subtotal());
            totalShippingFee = totalShippingFee.add(vendorShippingFee);

            shippingChargeRepository.save(OrderVendorShippingCharge.builder()
                    .orderId(saved.getId())
                    .vendorId(group.vendorId())
                    .shippingFeeAmount(vendorShippingFee)
                    .build());
        }

        BigDecimal totalAmount = runningTotal.add(totalShippingFee);
        // Shipping follows the same tax-inclusive convention as product prices (see
        // InvoiceService's documented reasoning) rather than being taxed on top of it -
        // taxAmount here is the GST already embedded in totalAmount, purely for display,
        // not an addition to it.
        GstExtractor.Breakdown taxBreakdown = GstExtractor.extract(totalAmount, GST_RATE_PERCENT);

        saved.setShippingFeeAmount(totalShippingFee);
        saved.setTotalAmount(totalAmount);
        saved.setTaxAmount(taxBreakdown.taxAmount());
        saved = orderRepository.save(saved);

        log.info("Order created: id={} orderNumber={} subtotal={} shipping={} tax={} total={}",
                saved.getId(), saved.getOrderNumber(), saved.getSubtotalAmount(),
                saved.getShippingFeeAmount(), saved.getTaxAmount(), saved.getTotalAmount());

        kafkaTemplate.send(
                KafkaTopics.ORDER_CREATED,
                saved.getOrderNumber(),
                new OrderCreatedEvent(saved.getId(), saved.getOrderNumber(),
                        saved.getCustomerEmail(), saved.getTotalAmount(), Instant.now())
        );

        return OrderResponse.from(saved);
    }

    public OrderResponse getById(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + id));
        return OrderResponse.from(order);
    }

    @Transactional
    public void markPaid(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));
        order.setStatus(Order.OrderStatus.PAID);
        orderRepository.save(order);
        log.info("Order marked PAID: id={}", orderId);
    }

    @Transactional
    public void markPaymentFailed(Long orderId, String reason) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        if (order.getStatus() == Order.OrderStatus.PAYMENT_FAILED) {
            log.info("Order already marked PAYMENT_FAILED, skipping duplicate stock restoration: id={}", orderId);
            return;
        }

        order.setStatus(Order.OrderStatus.PAYMENT_FAILED);
        orderRepository.save(order);

        // Restore stock that was decremented at order creation - this order will never complete,
        // so the reservation must be released back to the catalog for other customers to buy.
        for (OrderItem item : order.getItems()) {
            productRepository.incrementStock(item.getProductId(), item.getQuantity());
        }

        log.warn("Order marked PAYMENT_FAILED and stock restored: id={} reason={}", orderId, reason);
    }

    private String generateOrderNumber() {
        String datePart = DATE_FMT.format(Instant.now());
        int randomPart = 10000 + RANDOM.nextInt(90000);
        return "ORD-" + datePart + "-" + randomPart;
    }
}
