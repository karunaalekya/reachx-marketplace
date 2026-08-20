package com.marketplace.invoice.service;

import com.marketplace.catalog.storage.StorageService;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.util.GstExtractor;
import com.marketplace.invoice.dto.InvoiceResponse;
import com.marketplace.invoice.model.Invoice;
import com.marketplace.invoice.repository.InvoiceRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.model.OrderVendorShippingCharge;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.repository.OrderVendorShippingChargeRepository;
import com.marketplace.shipping.model.Shipment;
import com.marketplace.shipping.repository.ShipmentRepository;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class InvoiceService {

    // Flat rate, not per-HSN-code. Product has no tax-rate/HSN field in this schema, so a real
    // per-category GST rate (0/5/12/18/28%) can't be computed - this is a documented
    // simplification, not an oversight. Revisit if/when Product gains an HSN code + rate field.
    private static final BigDecimal GST_RATE_PERCENT = new BigDecimal("18.00");
    private static final BigDecimal TWO = new BigDecimal("2");

    private final InvoiceRepository invoiceRepository;
    private final ShipmentRepository shipmentRepository;
    private final OrderRepository orderRepository;
    private final VendorRepository vendorRepository;
    private final OrderVendorShippingChargeRepository shippingChargeRepository;
    private final StorageService storageService;
    private final InvoiceNumberGenerator numberGenerator;
    private final InvoicePdfGenerator pdfGenerator;

    // Triggered off the shipment.created Kafka event, i.e. once Shiprocket has actually accepted
    // the shipment (see PROJECT_STATE.md's "READY_TO_SHIP" decision) - the closest point this
    // system's Shipment.ShipmentStatus vocabulary has to that concept, since there's no literal
    // READY_TO_SHIP status here (see ShippingService/Shipment.ShipmentStatus).
    @Transactional
    public void generateForShipment(Long shipmentId) {
        Shipment shipment = shipmentRepository.findById(shipmentId)
                .orElseThrow(() -> new ResourceNotFoundException("Shipment not found with id: " + shipmentId));

        if (invoiceRepository.existsByOrderIdAndVendorId(shipment.getOrderId(), shipment.getVendorId())) {
            log.info("Invoice already exists for orderId={} vendorId={}, skipping",
                    shipment.getOrderId(), shipment.getVendorId());
            return;
        }

        Order order = orderRepository.findById(shipment.getOrderId())
                .orElseThrow(() -> new ResourceNotFoundException("Order not found with id: " + shipment.getOrderId()));
        Vendor vendor = vendorRepository.findById(shipment.getVendorId())
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found with id: " + shipment.getVendorId()));

        if (order.getCustomerState() == null || order.getCustomerState().isBlank()) {
            // Fails loud rather than guessing a tax type - a wrong CGST/SGST-vs-IGST call is a
            // real compliance problem, not a cosmetic one. Routes to this listener's own DLT via
            // KafkaErrorHandlingConfig instead of silently issuing a wrong invoice.
            throw new IllegalStateException(
                    "Order " + order.getId() + " has no customerState - cannot determine GST place of supply. "
                            + "This order predates the customerState field (V12) and needs manual handling.");
        }
        if (vendor.getState() == null || vendor.getState().isBlank()) {
            throw new IllegalStateException(
                    "Vendor " + vendor.getId() + " has no state set - cannot determine GST place of supply.");
        }

        List<OrderItem> vendorItems = order.getItems().stream()
                .filter(i -> i.getVendorId().equals(vendor.getId()))
                .toList();

        if (vendorItems.isEmpty()) {
            throw new IllegalStateException(
                    "No order items found for vendorId=" + vendor.getId() + " on orderId=" + order.getId());
        }

        Invoice invoice = buildInvoice(order, vendor, shipment, vendorItems);

        byte[] pdfBytes = pdfGenerator.generate(invoice, order, vendor, vendorItems);
        String objectKey = "invoices/%d/%d/%s.pdf".formatted(
                order.getId(), vendor.getId(), invoice.getInvoiceNumber().replace("/", "-"));
        storageService.putObject(objectKey, pdfBytes, "application/pdf");

        invoice.setStorageKey(objectKey);
        invoice.setPdfUrl(storageService.publicUrlFor(objectKey));

        Invoice saved = invoiceRepository.save(invoice);
        log.info("Invoice generated: invoiceNumber={} orderId={} vendorId={} taxType={} total={}",
                saved.getInvoiceNumber(), order.getId(), vendor.getId(), saved.getTaxType(), saved.getTotalAmount());
    }

    private Invoice buildInvoice(Order order, Vendor vendor, Shipment shipment, List<OrderItem> vendorItems) {
        // Prices in this system are charged to the customer as-is (see OrderService - no
        // separate tax line at checkout). Treating the vendor's collected subtotal as
        // tax-inclusive and extracting GST from within it (rather than adding GST on top) keeps
        // the invoice total identical to what the customer actually paid via the payment
        // gateway - adding tax on top would show a total the customer never agreed to or paid.
        BigDecimal itemsTotal = vendorItems.stream()
                .map(OrderItem::getLineTotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        // This vendor's own shipping charge (see OrderVendorShippingCharge / OrderService) folds
        // into the same tax-inclusive total - a vendor's invoice must reflect everything that
        // vendor actually collected, not just their product lines. Absent for orders/invoices
        // predating shipping charges, hence the default-to-ZERO rather than a required lookup.
        BigDecimal shippingFeeAmount = shippingChargeRepository.findByOrderIdAndVendorId(order.getId(), vendor.getId())
                .map(OrderVendorShippingCharge::getShippingFeeAmount)
                .orElse(BigDecimal.ZERO);

        BigDecimal totalAmount = itemsTotal.add(shippingFeeAmount);

        GstExtractor.Breakdown taxBreakdown = GstExtractor.extract(totalAmount, GST_RATE_PERCENT);
        BigDecimal taxableValue = taxBreakdown.taxableValue();
        BigDecimal taxAmount = taxBreakdown.taxAmount();

        boolean intraState = vendor.getState().trim().equalsIgnoreCase(order.getCustomerState().trim());

        InvoiceNumberGenerator.Allocation allocation = numberGenerator.allocateNext(vendor.getId());

        Invoice.InvoiceBuilder builder = Invoice.builder()
                .invoiceNumber(allocation.invoiceNumber())
                .orderId(order.getId())
                .vendorId(vendor.getId())
                .shipmentId(shipment.getId())
                .financialYear(allocation.financialYear())
                .sequenceNumber(allocation.sequenceNumber())
                .vendorState(vendor.getState())
                .customerState(order.getCustomerState())
                .taxRatePercent(GST_RATE_PERCENT)
                .taxableValue(taxableValue)
                .shippingFeeAmount(shippingFeeAmount)
                .totalAmount(totalAmount)
                .generatedAt(Instant.now());

        if (intraState) {
            BigDecimal half = taxAmount.divide(TWO, 2, RoundingMode.HALF_UP);
            builder.taxType(Invoice.TaxType.CGST_SGST).cgstAmount(half).sgstAmount(half);
        } else {
            builder.taxType(Invoice.TaxType.IGST).igstAmount(taxAmount);
        }

        return builder.build();
    }

    public Page<InvoiceResponse> findByVendor(Long vendorId, Pageable pageable) {
        return invoiceRepository.findByVendorId(vendorId, pageable).map(InvoiceResponse::from);
    }

    public List<InvoiceResponse> findByOrder(Long orderId) {
        return invoiceRepository.findByOrderId(orderId).stream().map(InvoiceResponse::from).toList();
    }

    public Invoice getById(Long id) {
        return invoiceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Invoice not found with id: " + id));
    }
}
