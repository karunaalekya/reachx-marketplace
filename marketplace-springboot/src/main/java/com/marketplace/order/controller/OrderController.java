package com.marketplace.order.controller;

import com.marketplace.order.dto.CreateOrderRequest;
import com.marketplace.order.dto.OrderResponse;
import com.marketplace.common.security.CurrentVendor;
import com.marketplace.order.dto.VendorOrderResponse;
import com.marketplace.order.model.Order;
import com.marketplace.order.service.OrderService;

import java.util.Map;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/orders")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    // Public: checkout doesn't require the customer to have an account in this scope.
    // Idempotency-Key is optional but strongly recommended by the frontend for checkout -
    // a retried request with the same key returns the original order instead of creating
    // a duplicate (and double-decrementing stock).
    @PostMapping
    public ResponseEntity<OrderResponse> create(
            @Valid @RequestBody CreateOrderRequest request,
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.status(HttpStatus.CREATED).body(orderService.createOrder(request, idempotencyKey));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<OrderResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getById(id));
    }

    // Public order-tracking lookup for the (guest-checkout) customer - order number alone isn't
    // enough, since order numbers are sequential-ish and guessable. Requiring the email the
    // customer entered at checkout closes that off, same pattern as Flipkart/Amazon guest order
    // tracking.
    @GetMapping("/lookup")
    public ResponseEntity<OrderResponse> lookup(
            @RequestParam String orderNumber,
            @RequestParam String email) {
        return ResponseEntity.ok(orderService.lookupByOrderNumberAndEmail(orderNumber, email));
    }

    // Vendor's own orders - each vendor sees only their own items/subtotal/shipment,
    // never another vendor's products sharing the same order. Optional status filter powers
    // Amazon/Flipkart-style tabs (Pending/Shipped/Delivered/etc.) on the frontend.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<VendorOrderResponse>> mine(
            @CurrentVendor Long vendorId,
            @RequestParam(required = false) Order.OrderStatus status,
            Pageable pageable) {
        return ResponseEntity.ok(orderService.findMineForVendor(vendorId, status, pageable));
    }

    // Per-status counts for the current vendor - powers badge numbers on each tab, same
    // pattern as GET /commissions/mine/pending-total.
    @GetMapping("/mine/status-counts")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Map<String, Long>> myStatusCounts(@CurrentVendor Long vendorId) {
        return ResponseEntity.ok(orderService.getStatusCountsForVendor(vendorId));
    }
}
