package com.marketplace.catalog.event;

import java.math.BigDecimal;
import java.time.Instant;

// Published to "product.created" - consumed by search-index-service to update Elasticsearch/search cache.
public record ProductCreatedEvent(
        Long productId,
        Long vendorId,
        String name,
        BigDecimal price,
        Instant createdAt
) {}
