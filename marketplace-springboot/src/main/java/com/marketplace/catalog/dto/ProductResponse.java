package com.marketplace.catalog.dto;

import com.marketplace.catalog.model.Product;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record ProductResponse(
        Long id,
        Long vendorId,
        Long categoryId,
        String name,
        String description,
        BigDecimal price,
        Integer stockQuantity,
        String sku,
        String status,
        Instant createdAt,
        List<String> imageUrls
) implements Serializable {
    // Kept for call sites that don't have image URLs on hand (e.g. right after create, before
    // any image is uploaded) - avoids forcing an extra query just to pass an empty list in.
    public static ProductResponse from(Product product) {
        return from(product, List.of());
    }

    public static ProductResponse from(Product product, List<String> imageUrls) {
        return new ProductResponse(
                product.getId(),
                product.getVendorId(),
                product.getCategoryId(),
                product.getName(),
                product.getDescription(),
                product.getPrice(),
                product.getStockQuantity(),
                product.getSku(),
                product.getStatus().name(),
                product.getCreatedAt(),
                imageUrls
        );
    }
}
