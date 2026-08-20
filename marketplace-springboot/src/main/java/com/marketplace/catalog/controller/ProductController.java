package com.marketplace.catalog.controller;

import com.marketplace.catalog.dto.ProductRequest;
import com.marketplace.catalog.dto.ProductResponse;
import com.marketplace.catalog.service.ProductService;
import com.marketplace.common.security.CurrentVendor;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;

@RestController
@RequestMapping("/api/v1/products")
@RequiredArgsConstructor
public class ProductController {

    private final ProductService productService;

    // Public storefront search - no auth required.
    @GetMapping
    public ResponseEntity<Page<ProductResponse>> search(
            @RequestParam(required = false) Long categoryId,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(required = false) String q,
            Pageable pageable) {
        return ResponseEntity.ok(productService.search(categoryId, minPrice, maxPrice, q, pageable));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ProductResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<ProductResponse> create(
            @CurrentVendor Long vendorId,
            @Valid @RequestBody ProductRequest request) {
        ProductResponse response = productService.create(vendorId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<ProductResponse>> myProducts(
            @CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(productService.findByVendor(vendorId, pageable));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<ProductResponse> update(
            @CurrentVendor Long vendorId,
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.update(vendorId, id, request));
    }

    @PostMapping("/{id}/publish")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Void> publish(@CurrentVendor Long vendorId, @PathVariable Long id) {
        productService.publish(vendorId, id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Void> archive(@CurrentVendor Long vendorId, @PathVariable Long id) {
        productService.archive(vendorId, id);
        return ResponseEntity.noContent().build();
    }
}
