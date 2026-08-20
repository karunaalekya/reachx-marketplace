package com.marketplace.catalog.dto;

import com.marketplace.catalog.model.ProductImage;

import java.io.Serializable;
import java.time.Instant;

public record ProductImageResponse(
        Long id,
        Long productId,
        String imageUrl,
        Integer displayOrder,
        Instant createdAt
) implements Serializable {
    public static ProductImageResponse from(ProductImage image) {
        return new ProductImageResponse(
                image.getId(),
                image.getProductId(),
                image.getImageUrl(),
                image.getDisplayOrder(),
                image.getCreatedAt()
        );
    }
}
