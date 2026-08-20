package com.marketplace.shipping.service;

import com.marketplace.config.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class OrderPaidListener {

    private final ShippingService shippingService;

    @KafkaListener(topics = KafkaTopics.ORDER_PAID, groupId = "shipping-service",
            containerFactory = "shippingKafkaListenerContainerFactory")
    public void onOrderPaid(Long orderId) {
        log.info("Received order.paid event for orderId={}, creating shipments", orderId);
        // No try/catch here by design: DefaultErrorHandler (KafkaErrorHandlingConfig) now retries
        // 3x then routes to "order.paid.DLT" on persistent failure, instead of this listener
        // silently swallowing and logging - failures are now recoverable, not just observable.
        shippingService.createShipmentsForPaidOrder(orderId);
    }
}
