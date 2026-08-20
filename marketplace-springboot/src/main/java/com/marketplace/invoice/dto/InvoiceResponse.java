package com.marketplace.invoice.dto;

import com.marketplace.invoice.model.Invoice;

import java.math.BigDecimal;
import java.time.Instant;

public record InvoiceResponse(
        Long id,
        String invoiceNumber,
        Long orderId,
        Long vendorId,
        String taxType,
        BigDecimal taxRatePercent,
        BigDecimal taxableValue,
        BigDecimal shippingFeeAmount,
        BigDecimal cgstAmount,
        BigDecimal sgstAmount,
        BigDecimal igstAmount,
        BigDecimal totalAmount,
        String pdfUrl,
        Instant generatedAt
) {
    public static InvoiceResponse from(Invoice invoice) {
        return new InvoiceResponse(
                invoice.getId(), invoice.getInvoiceNumber(), invoice.getOrderId(), invoice.getVendorId(),
                invoice.getTaxType().name(), invoice.getTaxRatePercent(), invoice.getTaxableValue(),
                invoice.getShippingFeeAmount(), invoice.getCgstAmount(), invoice.getSgstAmount(), invoice.getIgstAmount(),
                invoice.getTotalAmount(), invoice.getPdfUrl(), invoice.getGeneratedAt()
        );
    }
}
