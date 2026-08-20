package com.marketplace.catalog.repository;

import com.marketplace.catalog.model.ProductImage;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ProductImageRepository extends JpaRepository<ProductImage, Long> {

    List<ProductImage> findByProductIdOrderByDisplayOrderAsc(Long productId);

    int countByProductId(Long productId);

    // Used when composing ProductResponse for search/list results - a single query per page
    // instead of N+1 (one findByProductId call per product) when Product doesn't lazy-load images.
    List<ProductImage> findByProductIdInOrderByDisplayOrderAsc(List<Long> productIds);

    void deleteByIdAndProductId(Long id, Long productId);
}
