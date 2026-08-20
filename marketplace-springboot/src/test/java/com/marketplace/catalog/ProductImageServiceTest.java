package com.marketplace.catalog;

import com.marketplace.catalog.dto.ConfirmImageUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadRequest;
import com.marketplace.catalog.dto.PresignedUploadResponse;
import com.marketplace.catalog.dto.ProductImageResponse;
import com.marketplace.catalog.model.Product;
import com.marketplace.catalog.model.ProductImage;
import com.marketplace.catalog.repository.ProductImageRepository;
import com.marketplace.catalog.repository.ProductRepository;
import com.marketplace.catalog.service.ProductImageService;
import com.marketplace.catalog.storage.StorageService;
import com.marketplace.common.exception.DuplicateResourceException;
import com.marketplace.common.exception.ResourceNotFoundException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ProductImageServiceTest {

    @Mock private ProductRepository productRepository;
    @Mock private ProductImageRepository productImageRepository;
    @Mock private StorageService storageService;

    @InjectMocks private ProductImageService productImageService;

    private Product ownedProduct;

    @BeforeEach
    void setUp() {
        ownedProduct = Product.builder().id(1L).vendorId(10L).name("Test Product").build();
    }

    @Test
    void presign_returnsUploadUrl_whenVendorOwnsProductAndUnderLimit() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));
        when(productImageRepository.countByProductId(1L)).thenReturn(2);
        when(storageService.createPresignedUpload(anyString(), eq("image/jpeg")))
                .thenReturn(new StorageService.PresignedUpload(
                        "https://bucket.s3/upload-url", "https://bucket.s3/products/1/abc.jpg",
                        "products/1/abc.jpg", 300));

        PresignedUploadResponse response = productImageService.createPresignedUpload(
                10L, 1L, new PresignedUploadRequest("photo.jpg", "image/jpeg"));

        assertEquals("https://bucket.s3/upload-url", response.uploadUrl());
        assertTrue(response.objectKey().startsWith("products/1/"));
    }

    @Test
    void presign_throwsNotFound_whenVendorDoesNotOwnProduct() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));

        assertThrows(ResourceNotFoundException.class, () ->
                productImageService.createPresignedUpload(
                        999L, 1L, new PresignedUploadRequest("photo.jpg", "image/jpeg")));
    }

    @Test
    void presign_throwsDuplicate_whenAtImageLimit() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));
        when(productImageRepository.countByProductId(1L)).thenReturn(10);

        assertThrows(DuplicateResourceException.class, () ->
                productImageService.createPresignedUpload(
                        10L, 1L, new PresignedUploadRequest("photo.jpg", "image/jpeg")));
    }

    @Test
    void confirmUpload_savesImage_whenObjectKeyBelongsToProduct() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));
        when(productImageRepository.countByProductId(1L)).thenReturn(0);
        when(storageService.publicUrlFor("products/1/abc.jpg"))
                .thenReturn("https://bucket.s3/products/1/abc.jpg");
        when(productImageRepository.save(any(ProductImage.class))).thenAnswer(inv -> {
            ProductImage img = inv.getArgument(0);
            img.setId(5L);
            return img;
        });

        ProductImageResponse response = productImageService.confirmUpload(
                10L, 1L, new ConfirmImageUploadRequest("products/1/abc.jpg", 0));

        assertEquals("https://bucket.s3/products/1/abc.jpg", response.imageUrl());
    }

    // The security-critical case: a vendor must not be able to attach an image uploaded under
    // a different product's (or a different vendor's) key namespace to this product.
    @Test
    void confirmUpload_throwsIllegalArgument_whenObjectKeyBelongsToDifferentProduct() {
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));

        assertThrows(IllegalArgumentException.class, () ->
                productImageService.confirmUpload(
                        10L, 1L, new ConfirmImageUploadRequest("products/999/abc.jpg", 0)));

        verify(productImageRepository, never()).save(any());
    }

    @Test
    void delete_removesImage_whenVendorOwnsProductAndImageBelongsToIt() {
        ProductImage image = ProductImage.builder().id(5L).productId(1L).storageKey("products/1/abc.jpg").build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));
        when(productImageRepository.findById(5L)).thenReturn(Optional.of(image));

        productImageService.delete(10L, 1L, 5L);

        verify(storageService).deleteObject("products/1/abc.jpg");
        verify(productImageRepository).delete(image);
    }

    @Test
    void delete_throwsNotFound_whenImageBelongsToDifferentProduct() {
        ProductImage image = ProductImage.builder().id(5L).productId(2L).storageKey("products/2/abc.jpg").build();
        when(productRepository.findById(1L)).thenReturn(Optional.of(ownedProduct));
        when(productImageRepository.findById(5L)).thenReturn(Optional.of(image));

        assertThrows(ResourceNotFoundException.class, () ->
                productImageService.delete(10L, 1L, 5L));

        verify(storageService, never()).deleteObject(anyString());
    }

    @Test
    void listForProduct_returnsImagesOrderedByDisplayOrder() {
        ProductImage img1 = ProductImage.builder().id(1L).productId(1L).imageUrl("url1").displayOrder(0).build();
        ProductImage img2 = ProductImage.builder().id(2L).productId(1L).imageUrl("url2").displayOrder(1).build();
        when(productImageRepository.findByProductIdOrderByDisplayOrderAsc(1L))
                .thenReturn(List.of(img1, img2));

        List<ProductImageResponse> result = productImageService.listForProduct(1L);

        assertEquals(2, result.size());
        assertEquals("url1", result.get(0).imageUrl());
    }
}
