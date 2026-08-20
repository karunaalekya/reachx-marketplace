package com.marketplace.shipping.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.config.KafkaTopics;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.shipping.client.ShiprocketClient;
import com.marketplace.shipping.event.ShipmentStatusChangedEvent;
import com.marketplace.shipping.model.Shipment;
import com.marketplace.shipping.repository.ShipmentRepository;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ShippingService {

    private final ShipmentRepository shipmentRepository;
    private final OrderRepository orderRepository;
    private final VendorRepository vendorRepository;
    private final ShiprocketClient shiprocketClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    // Fallback only - used when a vendor hasn't configured their own pickup location yet.
    // Real launch should require every active vendor to set this during onboarding.
    @Value("${shiprocket.default-pickup-location}")
    private String defaultPickupLocation;

    // Called after payment succeeds. Splits the order by vendor and creates a separate
    // Shiprocket shipment per vendor, since each vendor ships independently.
    @Transactional
    public void createShipmentsForPaidOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + orderId));

        if (order.getStatus() != Order.OrderStatus.PAID) {
            throw new IllegalStateException(
                    "Cannot create shipments for an order that is not PAID (current: " + order.getStatus() + ")");
        }

        Map<Long, List<OrderItem>> itemsByVendor = order.getItems().stream()
                .collect(Collectors.groupingBy(OrderItem::getVendorId));

        for (Map.Entry<Long, List<OrderItem>> entry : itemsByVendor.entrySet()) {
            Long vendorId = entry.getKey();
            List<OrderItem> vendorItems = entry.getValue();

            if (shipmentRepository.findByOrderIdAndVendorId(orderId, vendorId).isPresent()) {
                log.info("Shipment already exists for orderId={} vendorId={}, skipping", orderId, vendorId);
                continue;
            }

            createSingleVendorShipment(order, vendorId, vendorItems);
        }
    }

    private void createSingleVendorShipment(Order order, Long vendorId, List<OrderItem> items) {
        Shipment shipment = Shipment.builder()
                .orderId(order.getId())
                .vendorId(vendorId)
                .status(Shipment.ShipmentStatus.PENDING)
                .build();
        shipment = shipmentRepository.save(shipment);

        try {
            Map<String, Object> payload = buildShiprocketPayload(order, vendorId, items);
            JsonNode response = shiprocketClient.createOrder(payload);

            shipment.setShiprocketOrderId(response.path("order_id").asText(null));
            shipment.setShiprocketShipmentId(response.path("shipment_id").asText(null));
            shipment.setStatus(Shipment.ShipmentStatus.CREATED);
            shipmentRepository.save(shipment);

            log.info("Shiprocket shipment created: orderId={} vendorId={} shiprocketOrderId={}",
                    order.getId(), vendorId, shipment.getShiprocketOrderId());

            kafkaTemplate.send(KafkaTopics.SHIPMENT_CREATED, shipment.getId().toString(), shipment.getId());
        } catch (Exception e) {
            // Shipment creation failing must not roll back the whole transaction and lose the
            // PENDING record - ops needs visibility into which vendor's shipment failed, to retry
            // manually rather than the failure silently vanishing.
            log.error("Shiprocket shipment creation failed: orderId={} vendorId={}", order.getId(), vendorId, e);
            shipment.setStatus(Shipment.ShipmentStatus.FAILED);
            shipment.setFailureReason(e.getMessage());
            shipmentRepository.save(shipment);
        }
    }

    private Map<String, Object> buildShiprocketPayload(Order order, Long vendorId, List<OrderItem> items) {
        Vendor vendor = vendorRepository.findById(vendorId)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found with id: " + vendorId));

        String pickupLocation = (vendor.getPickupLocationName() != null && !vendor.getPickupLocationName().isBlank())
                ? vendor.getPickupLocationName()
                : defaultPickupLocation;

        List<Map<String, Object>> orderItems = items.stream()
                .map(i -> Map.<String, Object>of(
                        "name", i.getProductName(),
                        "sku", "PROD-" + i.getProductId(),
                        "units", i.getQuantity(),
                        "selling_price", i.getUnitPrice()
                ))
                .toList();

        double vendorSubtotal = items.stream()
                .mapToDouble(i -> i.getLineTotal().doubleValue())
                .sum();

        Map<String, Object> payload = new HashMap<>();
        payload.put("order_id", order.getOrderNumber() + "-V" + vendorId);
        payload.put("order_date", order.getCreatedAt().toString());
        payload.put("pickup_location", pickupLocation);
        payload.put("billing_customer_name", order.getCustomerEmail());
        payload.put("billing_address", order.getShippingAddress());
        payload.put("billing_phone", order.getCustomerPhone());
        payload.put("shipping_is_billing", true);
        payload.put("order_items", orderItems);
        payload.put("payment_method", "Prepaid");
        payload.put("sub_total", vendorSubtotal);
        return payload;
    }

    public List<com.marketplace.shipping.dto.ShipmentResponse> findByOrderId(Long orderId) {
        return shipmentRepository.findByOrderId(orderId).stream()
                .map(com.marketplace.shipping.dto.ShipmentResponse::from)
                .toList();
    }

    // Called by the tracking webhook once signature/source is verified.
    @Transactional
    public void updateShipmentStatus(String awbNumber, String newStatus) {
        Shipment shipment = shipmentRepository.findByAwbNumber(awbNumber)
                .orElseThrow(() -> new ResourceNotFoundException("No shipment found for AWB: " + awbNumber));

        Shipment.ShipmentStatus mapped = mapShiprocketStatus(newStatus);
        if (mapped == null) {
            // Unrecognized status - log and skip rather than risk overwriting a valid state
            // (e.g. regressing DELIVERED back to SHIPPED because of an unmapped string).
            log.warn("Unrecognized Shiprocket status '{}' for AWB={}, shipment left unchanged", newStatus, awbNumber);
            return;
        }

        Shipment.ShipmentStatus previousStatus = shipment.getStatus();
        shipment.setStatus(mapped);
        shipmentRepository.save(shipment);

        log.info("Shipment status updated: awb={} status={}", awbNumber, mapped);

        kafkaTemplate.send(
                KafkaTopics.SHIPMENT_STATUS_CHANGED,
                shipment.getId().toString(),
                new ShipmentStatusChangedEvent(
                        shipment.getId(), shipment.getOrderId(), shipment.getVendorId(),
                        mapped.name(), awbNumber, Instant.now())
        );

        // Locked payout architecture (PROJECT_STATE.md): vendor payout is released on delivery
        // confirmation, not at swipe-time - this is the actual trigger point. Guarded by
        // previousStatus != DELIVERED so a duplicate/out-of-order Shiprocket webhook re-reporting
        // DELIVERED doesn't publish payout.eligible twice (PayoutService is itself idempotent per
        // commission record either way, via the payouts.commission_record_id unique constraint,
        // but avoiding the duplicate event here is cheaper than relying on that as the only guard).
        if (mapped == Shipment.ShipmentStatus.DELIVERED && previousStatus != Shipment.ShipmentStatus.DELIVERED) {
            kafkaTemplate.send(
                    KafkaTopics.PAYOUT_ELIGIBLE,
                    shipment.getId().toString(),
                    new com.marketplace.payout.event.PayoutEligibleEvent(
                            shipment.getOrderId(), shipment.getVendorId(), Instant.now())
            );
            log.info("Published payout.eligible: orderId={} vendorId={}", shipment.getOrderId(), shipment.getVendorId());
        }
    }

    private Shipment.ShipmentStatus mapShiprocketStatus(String shiprocketStatus) {
        // Shiprocket's own status vocabulary is broader than ours - map defensively rather
        // than letting an unrecognized status throw and drop the webhook. Returns null for
        // anything unmapped so the caller can skip the update instead of guessing.
        return switch (shiprocketStatus.toUpperCase(Locale.ROOT)) {
            case "PICKED UP", "PICKUP GENERATED" -> Shipment.ShipmentStatus.PICKUP_SCHEDULED;
            case "SHIPPED", "IN TRANSIT" -> Shipment.ShipmentStatus.SHIPPED;
            case "OUT FOR DELIVERY" -> Shipment.ShipmentStatus.OUT_FOR_DELIVERY;
            case "DELIVERED" -> Shipment.ShipmentStatus.DELIVERED;
            case "RTO INITIATED", "RTO DELIVERED" -> Shipment.ShipmentStatus.RTO;
            case "CANCELLED", "LOST" -> Shipment.ShipmentStatus.FAILED;
            default -> null;
        };
    }
}
