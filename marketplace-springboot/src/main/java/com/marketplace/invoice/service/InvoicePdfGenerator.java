package com.marketplace.invoice.service;

import com.lowagie.text.*;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import com.marketplace.invoice.model.Invoice;
import com.marketplace.order.model.Order;
import com.marketplace.order.model.OrderItem;
import com.marketplace.vendor.model.Vendor;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

// Renders a GST tax invoice as PDF using OpenPDF (LGPL/MPL - see pom.xml for why not iText).
// Deliberately plain/functional layout, not branded - a client can restyle this later without
// touching the tax-calculation logic in InvoiceService, which is the part that actually matters
// for compliance.
@Component
public class InvoicePdfGenerator {

    private static final DateTimeFormatter DATE_FMT =
            DateTimeFormatter.ofPattern("dd MMM yyyy", Locale.ENGLISH).withZone(ZoneOffset.UTC);
    private static final Font TITLE_FONT = new Font(Font.HELVETICA, 16, Font.BOLD);
    private static final Font HEADER_FONT = new Font(Font.HELVETICA, 10, Font.BOLD);
    private static final Font BODY_FONT = new Font(Font.HELVETICA, 9, Font.NORMAL);
    private static final Font SMALL_FONT = new Font(Font.HELVETICA, 8, Font.ITALIC);

    public byte[] generate(Invoice invoice, Order order, Vendor vendor, List<OrderItem> vendorItems) {
        Document document = new Document(PageSize.A4, 36, 36, 54, 36);
        ByteArrayOutputStream out = new ByteArrayOutputStream();

        try {
            PdfWriter.getInstance(document, out);
            document.open();

            document.add(title("TAX INVOICE"));
            document.add(Chunk.NEWLINE);

            document.add(sellerBuyerTable(invoice, order, vendor));
            document.add(Chunk.NEWLINE);

            document.add(metaTable(invoice, order));
            document.add(Chunk.NEWLINE);

            document.add(lineItemsTable(vendorItems));
            document.add(Chunk.NEWLINE);

            document.add(taxSummaryTable(invoice));
            document.add(Chunk.NEWLINE);

            Paragraph footer = new Paragraph(
                    "This is a system-generated invoice and does not require a physical signature.",
                    SMALL_FONT);
            document.add(footer);
        } catch (DocumentException e) {
            throw new IllegalStateException("Failed to generate invoice PDF", e);
        } finally {
            document.close();
        }

        return out.toByteArray();
    }

    private Paragraph title(String text) {
        Paragraph p = new Paragraph(text, TITLE_FONT);
        p.setAlignment(Element.ALIGN_CENTER);
        return p;
    }

    private PdfPTable sellerBuyerTable(Invoice invoice, Order order, Vendor vendor) throws DocumentException {
        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{1, 1});

        StringBuilder seller = new StringBuilder();
        seller.append(vendor.getBusinessName()).append("\n");
        if (vendor.getAddressLine1() != null) seller.append(vendor.getAddressLine1()).append("\n");
        if (vendor.getAddressLine2() != null && !vendor.getAddressLine2().isBlank())
            seller.append(vendor.getAddressLine2()).append("\n");
        seller.append(nullToBlank(vendor.getCity())).append(", ")
                .append(nullToBlank(vendor.getState())).append(" ")
                .append(nullToBlank(vendor.getPincode())).append("\n");
        seller.append("GSTIN: ").append(nullToBlank(vendor.getGstin()));

        StringBuilder buyer = new StringBuilder();
        buyer.append(order.getCustomerEmail()).append("\n");
        buyer.append(order.getCustomerPhone()).append("\n");
        buyer.append(order.getShippingAddress()).append("\n");
        buyer.append("State: ").append(nullToBlank(order.getCustomerState()));

        table.addCell(labeledCell("Seller (Sold By)", seller.toString()));
        table.addCell(labeledCell("Buyer (Ship To)", buyer.toString()));
        return table;
    }

    private PdfPTable metaTable(Invoice invoice, Order order) throws DocumentException {
        PdfPTable table = new PdfPTable(4);
        table.setWidthPercentage(100);

        table.addCell(labeledCell("Invoice No.", invoice.getInvoiceNumber()));
        table.addCell(labeledCell("Invoice Date", DATE_FMT.format(invoice.getGeneratedAt())));
        table.addCell(labeledCell("Order No.", order.getOrderNumber()));
        table.addCell(labeledCell("Place of Supply", nullToBlank(order.getCustomerState())));
        return table;
    }

    private PdfPTable lineItemsTable(List<OrderItem> items) throws DocumentException {
        PdfPTable table = new PdfPTable(4);
        table.setWidthPercentage(100);
        table.setWidths(new float[]{3, 1, 1, 1});

        table.addCell(headerCell("Item"));
        table.addCell(headerCell("Qty"));
        table.addCell(headerCell("Unit Price"));
        table.addCell(headerCell("Line Total"));

        for (OrderItem item : items) {
            table.addCell(bodyCell(item.getProductName()));
            table.addCell(bodyCell(String.valueOf(item.getQuantity())));
            table.addCell(bodyCell(formatAmount(item.getUnitPrice())));
            table.addCell(bodyCell(formatAmount(item.getLineTotal())));
        }
        return table;
    }

    private PdfPTable taxSummaryTable(Invoice invoice) throws DocumentException {
        PdfPTable table = new PdfPTable(2);
        table.setWidthPercentage(60);
        table.setHorizontalAlignment(Element.ALIGN_RIGHT);

        if (invoice.getShippingFeeAmount() != null && invoice.getShippingFeeAmount().compareTo(java.math.BigDecimal.ZERO) > 0) {
            table.addCell(labeledCell("Shipping (incl. in taxable value)", formatAmount(invoice.getShippingFeeAmount())));
        }
        table.addCell(labeledCell("Taxable Value", formatAmount(invoice.getTaxableValue())));
        if (invoice.getTaxType() == Invoice.TaxType.CGST_SGST) {
            table.addCell(labeledCell("CGST (%s%%)".formatted(halfRate(invoice)), formatAmount(invoice.getCgstAmount())));
            table.addCell(labeledCell("SGST (%s%%)".formatted(halfRate(invoice)), formatAmount(invoice.getSgstAmount())));
        } else {
            table.addCell(labeledCell("IGST (%s%%)".formatted(invoice.getTaxRatePercent().stripTrailingZeros().toPlainString()),
                    formatAmount(invoice.getIgstAmount())));
        }
        table.addCell(labeledCell("Total (incl. GST)", formatAmount(invoice.getTotalAmount())));
        return table;
    }

    private String halfRate(Invoice invoice) {
        return invoice.getTaxRatePercent().divide(java.math.BigDecimal.valueOf(2)).stripTrailingZeros().toPlainString();
    }

    private PdfPCell labeledCell(String label, String value) {
        Paragraph p = new Paragraph();
        p.add(new Chunk(label + "\n", HEADER_FONT));
        p.add(new Chunk(value == null ? "" : value, BODY_FONT));
        PdfPCell cell = new PdfPCell(p);
        cell.setPadding(6);
        return cell;
    }

    private PdfPCell headerCell(String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text, HEADER_FONT));
        cell.setPadding(5);
        return cell;
    }

    private PdfPCell bodyCell(String text) {
        PdfPCell cell = new PdfPCell(new Phrase(text, BODY_FONT));
        cell.setPadding(5);
        return cell;
    }

    private String formatAmount(java.math.BigDecimal amount) {
        return "Rs. " + amount.setScale(2, java.math.RoundingMode.HALF_UP).toPlainString();
    }

    private String nullToBlank(String s) {
        return s == null ? "" : s;
    }
}
