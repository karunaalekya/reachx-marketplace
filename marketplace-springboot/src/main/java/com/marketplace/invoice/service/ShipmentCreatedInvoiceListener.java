package com.marketplace.invoice.service;

import com.marketplace.config.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

// Same topic ShippingService already publishes to (shipment.created) - a dedicated consumer
// group ("invoice-service") rather than piggybacking on shipping-service's, so a failure in
// invoice generation is isolated with its own retry/DLT (shipment.created.invoice-service.DLT)
// and never affects shipment creation itself. Same pattern as OrderPaidListener.
@Component
@RequiredArgsConstructor
@Slf4j
public class ShipmentCreatedInvoiceListener {

    private final InvoiceService invoiceService;

    @KafkaListener(topics = KafkaTopics.SHIPMENT_CREATED, groupId = "invoice-service",
            containerFactory = "invoiceKafkaListenerContainerFactory")
    public void onShipmentCreated(Long shipmentId) {
        log.info("Received shipment.created event for shipmentId={}, generating GST invoice", shipmentId);
        invoiceService.generateForShipment(shipmentId);
    }
}
