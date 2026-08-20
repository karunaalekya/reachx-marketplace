package com.marketplace.catalog.service;

import com.marketplace.catalog.dto.ProductRequest;
import com.marketplace.catalog.dto.ProductResponse;
import com.marketplace.catalog.event.ProductCreatedEvent;
import com.marketplace.catalog.model.Product;
import com.marketplace.catalog.model.ProductImage;
import com.marketplace.catalog.repository.ProductImageRepository;
import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.common.exception.DuplicateResourceException;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.util.SlugUtil;
import com.marketplace.config.KafkaTopics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductService {

    private static final String PRODUCT_CACHE = "products";
    private static final String SEARCH_CACHE = "product-search";

    private final ProductRepository productRepository;
    private final ProductImageRepository productImageRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;

    @Transactional
    // Any write must evict the search cache - stale catalog results are worse than a slower write.
    @CacheEvict(value = SEARCH_CACHE, allEntries = true)
    public ProductResponse create(Long vendorId, ProductRequest request) {
        if (productRepository.existsByVendorIdAndSku(vendorId, request.sku())) {
            throw new DuplicateResourceException(
                    "You already have a product with SKU: " + request.sku());
        }

        Product product = Product.builder()
                .vendorId(vendorId)
                .categoryId(request.categoryId())
                .name(request.name())
                .slug(SlugUtil.toSlug(request.name()) + "-" + System.currentTimeMillis())
                .description(request.description())
                .price(request.price())
                .stockQuantity(request.stockQuantity())
                .sku(request.sku())
                .status(Product.ProductStatus.DRAFT)
                .build();

        Product saved = productRepository.save(product);
        log.info("Product created: id={} vendorId={} sku={}", saved.getId(), vendorId, saved.getSku());

        kafkaTemplate.send(
                KafkaTopics.PRODUCT_CREATED,
                saved.getId().toString(),
                new ProductCreatedEvent(saved.getId(), vendorId, saved.getName(), saved.getPrice(), Instant.now())
        );

        return ProductResponse.from(saved);
    }

    // Cached: catalog reads vastly outnumber writes. Cache key includes id so eviction is precise.
    // Note both ProductImageService.confirmUpload and .delete evict this same cache key, so an
    // image add/remove never leaves a stale imageUrls list served from cache.
    @Cacheable(value = PRODUCT_CACHE, key = "#id")
    public ProductResponse getById(Long id) {
        Product product = findOrThrow(id);
        List<String> imageUrls = productImageRepository.findByProductIdOrderByDisplayOrderAsc(id)
                .stream().map(ProductImage::getImageUrl).toList();
        return ProductResponse.from(product, imageUrls);
    }

    public Page<ProductResponse> findByVendor(Long vendorId, Pageable pageable) {
        return withImages(productRepository.findByVendorId(vendorId, pageable));
    }

    // Search results cached separately since query params make single-key caching impractical here;
    // TTL from application.yml (10 min) bounds staleness, and writes evict this cache wholesale.
    public Page<ProductResponse> search(Long categoryId, BigDecimal minPrice, BigDecimal maxPrice,
                                          String search, Pageable pageable) {
        return withImages(productRepository.search(categoryId, minPrice, maxPrice, search, pageable));
    }

    // Batches image lookups for an entire page in one query instead of one query per product
    // (N+1) - the same pattern ProductImageRepository.findByProductIdInOrderByDisplayOrderAsc
    // exists specifically to support.
    private Page<ProductResponse> withImages(Page<Product> page) {
        List<Long> ids = page.getContent().stream().map(Product::getId).toList();
        Map<Long, List<String>> imagesByProduct = productImageRepository
                .findByProductIdInOrderByDisplayOrderAsc(ids).stream()
                .collect(Collectors.groupingBy(
                        ProductImage::getProductId,
                        Collectors.mapping(ProductImage::getImageUrl, Collectors.toList())));

        return page.map(product -> ProductResponse.from(
                product, imagesByProduct.getOrDefault(product.getId(), List.of())));
    }

    @Transactional
    @CacheEvict(value = PRODUCT_CACHE, key = "#productId")
    public ProductResponse update(Long vendorId, Long productId, ProductRequest request) {
        Product product = findOrThrow(productId);
        assertOwnership(product, vendorId);

        product.setName(request.name());
        product.setDescription(request.description());
        product.setCategoryId(request.categoryId());
        product.setPrice(request.price());
        product.setStockQuantity(request.stockQuantity());

        if (request.stockQuantity() == 0) {
            product.setStatus(Product.ProductStatus.OUT_OF_STOCK);
        } else if (product.getStatus() == Product.ProductStatus.OUT_OF_STOCK) {
            product.setStatus(Product.ProductStatus.ACTIVE);
        }

        Product saved = productRepository.save(product);
        log.info("Product updated: id={} vendorId={}", productId, vendorId);

        // update() doesn't touch images, but a vendor editing a product that already has photos
        // should still see them in the response - not an empty list implying they got wiped.
        List<String> imageUrls = productImageRepository.findByProductIdOrderByDisplayOrderAsc(productId)
                .stream().map(ProductImage::getImageUrl).toList();
        return ProductResponse.from(saved, imageUrls);
    }

    @Transactional
    @CacheEvict(value = PRODUCT_CACHE, key = "#productId")
    public void publish(Long vendorId, Long productId) {
        Product product = findOrThrow(productId);
        assertOwnership(product, vendorId);

        if (product.getStockQuantity() <= 0) {
            throw new IllegalStateException("Cannot publish a product with zero stock");
        }

        product.setStatus(Product.ProductStatus.ACTIVE);
        productRepository.save(product);
        log.info("Product published: id={} vendorId={}", productId, vendorId);
    }

    @Transactional
    @CacheEvict(value = PRODUCT_CACHE, key = "#productId")
    public void archive(Long vendorId, Long productId) {
        Product product = findOrThrow(productId);
        assertOwnership(product, vendorId);
        product.setStatus(Product.ProductStatus.ARCHIVED);
        productRepository.save(product);
    }

    private Product findOrThrow(Long id) {
        return productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + id));
    }

    private void assertOwnership(Product product, Long vendorId) {
        if (!product.getVendorId().equals(vendorId)) {
            throw new ResourceNotFoundException("Product not found with id: " + product.getId());
        }
    }
}
