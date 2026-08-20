package com.marketplace.order.controller;

import com.marketplace.order.dto.CreateOrderRequest;
import com.marketplace.order.dto.OrderResponse;
import com.marketplace.order.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
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
    public ResponseEntity<OrderResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getById(id));
    }
}
