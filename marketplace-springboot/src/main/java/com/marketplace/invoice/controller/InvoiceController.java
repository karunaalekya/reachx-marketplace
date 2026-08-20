package com.marketplace.invoice.controller;

import com.marketplace.common.security.CurrentVendor;
import com.marketplace.invoice.dto.InvoiceResponse;
import com.marketplace.invoice.model.Invoice;
import com.marketplace.invoice.service.InvoiceService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.net.URI;
import java.util.List;

@RestController
@RequestMapping("/api/v1/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoiceService;

    // Vendor's own invoices.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<InvoiceResponse>> mine(@CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(invoiceService.findByVendor(vendorId, pageable));
    }

    // Admin: any vendor's invoices, for support/reconciliation.
    @GetMapping("/vendor/{vendorId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<InvoiceResponse>> byVendor(
            @PathVariable Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(invoiceService.findByVendor(vendorId, pageable));
    }

    // Public, same trust model as GET /orders/{id} and GET /shipments/order/{orderId} - order id
    // acts as the lookup key since checkout is guest-only with no customer account/auth in this
    // scope (see README "Known limitations"). Lists every vendor's invoice for a multi-vendor order.
    @GetMapping("/order/{orderId}")
    public ResponseEntity<List<InvoiceResponse>> byOrder(@PathVariable Long orderId) {
        return ResponseEntity.ok(invoiceService.findByOrder(orderId));
    }

    // Redirects to the PDF's bucket URL rather than streaming the binary through this app -
    // same "binary never passes through Spring Boot" principle as product images.
    // Split into vendor/admin variants (rather than one merged endpoint) because
    // @CurrentVendor always resolves to the caller's own JWT-subject id regardless of role -
    // an admin's id has no relation to invoice.vendorId, so a single shared ownership check
    // would falsely deny admins. Same split-by-role pattern as CommissionController.
    @GetMapping("/mine/{id}/download")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Void> downloadMine(@PathVariable Long id, @CurrentVendor Long vendorId) {
        Invoice invoice = invoiceService.getById(id);
        if (!invoice.getVendorId().equals(vendorId)) {
            throw new AccessDeniedException("This invoice does not belong to you");
        }
        return redirectTo(invoice.getPdfUrl());
    }

    @GetMapping("/{id}/download")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Void> download(@PathVariable Long id) {
        Invoice invoice = invoiceService.getById(id);
        return redirectTo(invoice.getPdfUrl());
    }

    private ResponseEntity<Void> redirectTo(String url) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(URI.create(url))
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .build();
    }
}
