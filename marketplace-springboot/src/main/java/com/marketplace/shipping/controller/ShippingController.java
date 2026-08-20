package com.marketplace.shipping.controller;

import com.marketplace.shipping.dto.ShiprocketTrackingWebhook;
import com.marketplace.shipping.service.ShippingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/shipments")
@RequiredArgsConstructor
@Slf4j
public class ShippingController {

    private final ShippingService shippingService;

    // Public: lets the frontend show tracking status per vendor sub-order without auth,
    // same trust model as GET /orders/{id} (order number/id acts as the lookup key).
    @GetMapping("/order/{orderId}")
    public ResponseEntity<java.util.List<com.marketplace.shipping.dto.ShipmentResponse>> byOrder(
            @PathVariable Long orderId) {
        return ResponseEntity.ok(shippingService.findByOrderId(orderId));
    }

    // Shiprocket's tracking webhook has no signature scheme like Razorpay's - trust is
    // instead established with a shared secret token in the URL path, which Shiprocket
    // supports configuring per-webhook. Anyone without this token gets a 403.
    @Value("${shiprocket.webhook-token}")
    private String expectedWebhookToken;

    @PostMapping("/webhook/shiprocket/{token}")
    public ResponseEntity<String> trackingWebhook(
            @PathVariable String token,
            @RequestBody ShiprocketTrackingWebhook payload) {

        if (!expectedWebhookToken.equals(token)) {
            log.warn("Rejected Shiprocket webhook - invalid token");
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body("Invalid token");
        }

        shippingService.updateShipmentStatus(payload.awb(), payload.current_status());
        return ResponseEntity.ok("OK");
    }
}
