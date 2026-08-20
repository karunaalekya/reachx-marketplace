package com.marketplace.catalog.controller;

import com.marketplace.catalog.dto.ConfirmImageUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadResponse;
import com.marketplace.catalog.dto.ProductImageResponse;
import com.marketplace.catalog.service.ProductImageService;
import com.marketplace.common.security.CurrentVendor;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/products/{productId}/images")
@RequiredArgsConstructor
public class ProductImageController {

    private final ProductImageService productImageService;

    // Step 1 of the presigned-upload flow: vendor asks permission, gets a short-lived upload URL.
    @PostMapping("/presign")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<PresignedUploadResponse> presign(
            @CurrentVendor Long vendorId,
            @PathVariable Long productId,
            @Valid @RequestBody PresignedUploadRequest request) {
        return ResponseEntity.ok(
                productImageService.createPresignedUpload(vendorId, productId, request));
    }

    // Step 2: React has already PUT the file bytes directly to the bucket using the presigned URL
    // from step 1 - this call never carries image binary, only the objectKey confirming it landed.
    @PostMapping
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<ProductImageResponse> confirmUpload(
            @CurrentVendor Long vendorId,
            @PathVariable Long productId,
            @Valid @RequestBody ConfirmImageUploadRequest request) {
        ProductImageResponse response =
                productImageService.confirmUpload(vendorId, productId, request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    // Public - storefront needs to render product images without auth, same as GET /products/{id}.
    @GetMapping
    public ResponseEntity<List<ProductImageResponse>> list(@PathVariable Long productId) {
        return ResponseEntity.ok(productImageService.listForProduct(productId));
    }

    @DeleteMapping("/{imageId}")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Void> delete(
            @CurrentVendor Long vendorId,
            @PathVariable Long productId,
            @PathVariable Long imageId) {
        productImageService.delete(vendorId, productId, imageId);
        return ResponseEntity.noContent().build();
    }
}
