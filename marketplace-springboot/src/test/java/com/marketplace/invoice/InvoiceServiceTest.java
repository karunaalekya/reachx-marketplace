package com.marketplace.invoice;

import com.marketplace.catalog.storage.StorageService;
import com.marketplace.invoice.model.Invoice;
import com.marketplace.invoice.repository.InvoiceRepository;
import com.marketplace.invoice.service.InvoiceNumberGenerator;
import com.marketplace.invoice.service.InvoicePdfGenerator;
import com.marketplace.invoice.service.InvoiceService;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.order.model.OrderVendorShippingCharge;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.order.repository.OrderVendorShippingChargeRepository;
import com.marketplace.shipping.model.Shipment;
import com.marketplace.shipping.repository.ShipmentRepository;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InvoiceServiceTest {

    @Mock private InvoiceRepository invoiceRepository;
    @Mock private ShipmentRepository shipmentRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private VendorRepository vendorRepository;
    @Mock private OrderVendorShippingChargeRepository shippingChargeRepository;
    @Mock private StorageService storageService;
    @Mock private InvoiceNumberGenerator numberGenerator;

    // Field order must match InvoiceService's actual constructor (Lombok
    // @RequiredArgsConstructor, generated from declared field order) - see ShippingServiceTest
    // for why this comment exists; a prior session found this exact drift bug elsewhere.
    private InvoiceService service() {
        return new InvoiceService(
                invoiceRepository, shipmentRepository, orderRepository, vendorRepository,
                shippingChargeRepository, storageService, numberGenerator, new InvoicePdfGenerator());
    }

    private Shipment shipment() {
        return Shipment.builder().id(1L).orderId(10L).vendorId(20L).build();
    }

    private OrderItem item(Long vendorId, BigDecimal lineTotal) {
        return OrderItem.builder()
                .vendorId(vendorId).productId(1L).productName("Widget")
                .unitPrice(lineTotal).quantity(1).lineTotal(lineTotal)
                .build();
    }

    @Test
    void generate_usesCgstSgst_whenVendorAndCustomerStateMatch() {
        Order order = Order.builder().id(10L).orderNumber("ORD-1")
                .customerEmail("buyer@test.com").customerPhone("9876543210")
                .shippingAddress("123 MG Road").customerState("Karnataka")
                .items(List.of(item(20L, BigDecimal.valueOf(1180))))
                .build();
        Vendor vendor = Vendor.builder().id(20L).businessName("Acme Traders")
                .state("Karnataka").gstin("29AAAAA0000A1Z5").build();

        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(false);
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(vendorRepository.findById(20L)).thenReturn(Optional.of(vendor));
        when(numberGenerator.allocateNext(20L))
                .thenReturn(new InvoiceNumberGenerator.Allocation("INV/20/2026-27/000001", "2026-27", 1));
        when(storageService.publicUrlFor(any())).thenReturn("https://bucket.example.com/invoice.pdf");

        service().generateForShipment(1L);

        ArgumentCaptor<Invoice> captor = ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceRepository).save(captor.capture());
        Invoice saved = captor.getValue();

        assertEquals(Invoice.TaxType.CGST_SGST, saved.getTaxType());
        assertEquals(0, saved.getIgstAmount().compareTo(BigDecimal.ZERO));
        // 1180 total, 18% GST inclusive -> taxable ~1000.00, tax ~180.00, split 90/90
        assertEquals(0, saved.getCgstAmount().compareTo(saved.getSgstAmount()));
        assertEquals(0, saved.getTotalAmount().compareTo(BigDecimal.valueOf(1180)));
        verify(storageService).putObject(any(), any(), eq("application/pdf"));
    }

    @Test
    void generate_usesIgst_whenVendorAndCustomerStateDiffer() {
        Order order = Order.builder().id(10L).orderNumber("ORD-1")
                .customerEmail("buyer@test.com").customerPhone("9876543210")
                .shippingAddress("123 MG Road").customerState("Maharashtra")
                .items(List.of(item(20L, BigDecimal.valueOf(1180))))
                .build();
        Vendor vendor = Vendor.builder().id(20L).businessName("Acme Traders")
                .state("Karnataka").gstin("29AAAAA0000A1Z5").build();

        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(false);
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(vendorRepository.findById(20L)).thenReturn(Optional.of(vendor));
        when(numberGenerator.allocateNext(20L))
                .thenReturn(new InvoiceNumberGenerator.Allocation("INV/20/2026-27/000001", "2026-27", 1));
        when(storageService.publicUrlFor(any())).thenReturn("https://bucket.example.com/invoice.pdf");

        service().generateForShipment(1L);

        ArgumentCaptor<Invoice> captor = ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceRepository).save(captor.capture());
        Invoice saved = captor.getValue();

        assertEquals(Invoice.TaxType.IGST, saved.getTaxType());
        assertEquals(0, saved.getCgstAmount().compareTo(BigDecimal.ZERO));
        assertEquals(0, saved.getSgstAmount().compareTo(BigDecimal.ZERO));
        assertTrue(saved.getIgstAmount().compareTo(BigDecimal.ZERO) > 0);
    }

    @Test
    void generate_foldsVendorShippingChargeIntoTaxableValueAndTotal() {
        Order order = Order.builder().id(10L).orderNumber("ORD-1")
                .customerEmail("buyer@test.com").customerPhone("9876543210")
                .shippingAddress("123 MG Road").customerState("Karnataka")
                .items(List.of(item(20L, BigDecimal.valueOf(1180))))
                .build();
        Vendor vendor = Vendor.builder().id(20L).businessName("Acme Traders")
                .state("Karnataka").gstin("29AAAAA0000A1Z5").build();
        OrderVendorShippingCharge shippingCharge = OrderVendorShippingCharge.builder()
                .orderId(10L).vendorId(20L).shippingFeeAmount(BigDecimal.valueOf(59)).build();

        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(false);
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(vendorRepository.findById(20L)).thenReturn(Optional.of(vendor));
        when(shippingChargeRepository.findByOrderIdAndVendorId(10L, 20L)).thenReturn(Optional.of(shippingCharge));
        when(numberGenerator.allocateNext(20L))
                .thenReturn(new InvoiceNumberGenerator.Allocation("INV/20/2026-27/000001", "2026-27", 1));
        when(storageService.publicUrlFor(any())).thenReturn("https://bucket.example.com/invoice.pdf");

        service().generateForShipment(1L);

        ArgumentCaptor<Invoice> captor = ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceRepository).save(captor.capture());
        Invoice saved = captor.getValue();

        // 1180 items + 59 shipping = 1239 tax-inclusive total, both folded in before extraction.
        assertEquals(0, saved.getShippingFeeAmount().compareTo(BigDecimal.valueOf(59)));
        assertEquals(0, saved.getTotalAmount().compareTo(BigDecimal.valueOf(1239)));
    }

    @Test
    void generate_defaultsShippingFeeToZero_whenNoShippingChargeRecordExists() {
        Order order = Order.builder().id(10L).orderNumber("ORD-1")
                .customerEmail("buyer@test.com").customerPhone("9876543210")
                .shippingAddress("123 MG Road").customerState("Karnataka")
                .items(List.of(item(20L, BigDecimal.valueOf(1180))))
                .build();
        Vendor vendor = Vendor.builder().id(20L).businessName("Acme Traders")
                .state("Karnataka").gstin("29AAAAA0000A1Z5").build();

        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(false);
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(vendorRepository.findById(20L)).thenReturn(Optional.of(vendor));
        when(shippingChargeRepository.findByOrderIdAndVendorId(10L, 20L)).thenReturn(Optional.empty());
        when(numberGenerator.allocateNext(20L))
                .thenReturn(new InvoiceNumberGenerator.Allocation("INV/20/2026-27/000001", "2026-27", 1));
        when(storageService.publicUrlFor(any())).thenReturn("https://bucket.example.com/invoice.pdf");

        service().generateForShipment(1L);

        ArgumentCaptor<Invoice> captor = ArgumentCaptor.forClass(Invoice.class);
        verify(invoiceRepository).save(captor.capture());
        Invoice saved = captor.getValue();

        assertEquals(0, saved.getShippingFeeAmount().compareTo(BigDecimal.ZERO));
        assertEquals(0, saved.getTotalAmount().compareTo(BigDecimal.valueOf(1180)));
    }

    @Test
    void generate_throws_whenOrderHasNoCustomerState() {
        Order order = Order.builder().id(10L).customerState(null)
                .items(List.of(item(20L, BigDecimal.valueOf(1180)))).build();

        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(false);
        when(orderRepository.findById(10L)).thenReturn(Optional.of(order));
        when(vendorRepository.findById(20L)).thenReturn(Optional.of(Vendor.builder().id(20L).state("Karnataka").build()));

        assertThrows(IllegalStateException.class, () -> service().generateForShipment(1L));
        verify(invoiceRepository, never()).save(any());
    }

    @Test
    void generate_skipsSilently_whenInvoiceAlreadyExistsForOrderAndVendor() {
        when(shipmentRepository.findById(1L)).thenReturn(Optional.of(shipment()));
        when(invoiceRepository.existsByOrderIdAndVendorId(10L, 20L)).thenReturn(true);

        service().generateForShipment(1L);

        verify(orderRepository, never()).findById(anyLong());
        verify(invoiceRepository, never()).save(any());
    }
}
