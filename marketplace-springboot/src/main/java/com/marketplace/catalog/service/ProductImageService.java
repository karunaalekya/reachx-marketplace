package com.marketplace.catalog.service;

import com.marketplace.catalog.dto.ConfirmImageUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadResponse;
import com.marketplace.catalog.dto.ProductImageResponse;
import com.marketplace.catalog.model.Product;
import com.marketplace.catalog.model.ProductImage;
import com.marketplace.catalog.repository.ProductImageRepository;
import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.catalog.storage.StorageService;
import com.marketplace.common.exception.DuplicateResourceException;
import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.util.SlugUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class ProductImageService {

    // Matches the DB-level cap enforced by the trg_product_image_limit trigger in V11 - kept in
    // sync deliberately (see migration comment). App-level check exists to fail with a clean 409
    // instead of a raw Postgres trigger exception bubbling up as a 500.
    private static final int MAX_IMAGES_PER_PRODUCT = 10;
    private static final String PRODUCT_CACHE = "products";

    private final ProductRepository productRepository;
    private final ProductImageRepository productImageRepository;
    private final StorageService storageService;

    public PresignedUploadResponse createPresignedUpload(
            Long vendorId, Long productId, PresignedUploadRequest request) {
        Product product = findOwnedProduct(vendorId, productId);

        long existingCount = productImageRepository.countByProductId(product.getId());
        if (existingCount >= MAX_IMAGES_PER_PRODUCT) {
            throw new DuplicateResourceException(
                    "Product already has the maximum of " + MAX_IMAGES_PER_PRODUCT + " images");
        }

        // Namespaced under products/{productId}/ so the confirm step can verify a returned
        // objectKey actually belongs to this product before trusting it (see confirmUpload).
        // UUID prefix on the filename avoids collisions between two uploads of the same filename.
        String safeFileName = SlugUtil.toSlug(stripExtension(request.fileName()))
                + extensionFor(request.contentType());
        String objectKey = "products/%d/%s-%s".formatted(productId, UUID.randomUUID(), safeFileName);

        StorageService.PresignedUpload upload =
                storageService.createPresignedUpload(objectKey, request.contentType());

        return PresignedUploadResponse.from(upload);
    }

    @Transactional
    @CacheEvict(value = PRODUCT_CACHE, key = "#productId")
    public ProductImageResponse confirmUpload(
            Long vendorId, Long productId, ConfirmImageUploadRequest request) {
        Product product = findOwnedProduct(vendorId, productId);

        // Critical check: the objectKey must fall under this product's own namespace. Without
        // this, a vendor could take a presigned URL they were issued for product A and use its
        // objectKey to attach an image record to product B (or worse, guess/reuse another
        // vendor's key and claim their uploaded file as their own product's image).
        String expectedPrefix = "products/%d/".formatted(productId);
        if (!request.objectKey().startsWith(expectedPrefix)) {
            throw new IllegalArgumentException(
                    "This upload key does not belong to product " + productId);
        }

        long existingCount = productImageRepository.countByProductId(product.getId());
        if (existingCount >= MAX_IMAGES_PER_PRODUCT) {
            throw new DuplicateResourceException(
                    "Product already has the maximum of " + MAX_IMAGES_PER_PRODUCT + " images");
        }

        // Public URL is derived server-side from the trusted objectKey, never taken from client
        // input - see ConfirmImageUploadRequest javadoc.
        String publicUrl = storageService.publicUrlFor(request.objectKey());

        ProductImage image = ProductImage.builder()
                .productId(product.getId())
                .imageUrl(publicUrl)
                .storageKey(request.objectKey())
                .displayOrder(request.displayOrder() != null ? request.displayOrder() : (int) existingCount)
                .build();

        ProductImage saved = productImageRepository.save(image);
        log.info("Product image confirmed: productId={} imageId={}", productId, saved.getId());
        return ProductImageResponse.from(saved);
    }

    public List<ProductImageResponse> listForProduct(Long productId) {
        return productImageRepository.findByProductIdOrderByDisplayOrderAsc(productId)
                .stream()
                .map(ProductImageResponse::from)
                .toList();
    }

    @Transactional
    @CacheEvict(value = PRODUCT_CACHE, key = "#productId")
    public void delete(Long vendorId, Long productId, Long imageId) {
        Product product = findOwnedProduct(vendorId, productId);

        ProductImage image = productImageRepository.findById(imageId)
                .orElseThrow(() -> new ResourceNotFoundException("Image not found with id: " + imageId));

        if (!image.getProductId().equals(product.getId())) {
            throw new ResourceNotFoundException("Image not found with id: " + imageId);
        }

        // Delete the bucket object first - if this throws, the DB row is left in place (fails
        // safe: a dangling row pointing at a still-existing object is recoverable/retryable;
        // a DB row deleted while the actual file survives orphaned in the bucket is a silent leak
        // that never gets cleaned up).
        storageService.deleteObject(image.getStorageKey());
        productImageRepository.delete(image);
        log.info("Product image deleted: productId={} imageId={}", productId, imageId);
    }

    private Product findOwnedProduct(Long vendorId, Long productId) {
        Product product = productRepository.findById(productId)
                .orElseThrow(() -> new ResourceNotFoundException("Product not found with id: " + productId));
        if (!product.getVendorId().equals(vendorId)) {
            throw new ResourceNotFoundException("Product not found with id: " + productId);
        }
        return product;
    }

    private String stripExtension(String fileName) {
        int dot = fileName.lastIndexOf('.');
        return dot > 0 ? fileName.substring(0, dot) : fileName;
    }

    private String extensionFor(String contentType) {
        return switch (contentType) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            default -> ".jpg"; // image/jpeg, image/jpg
        };
    }
}
