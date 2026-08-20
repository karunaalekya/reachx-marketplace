package com.marketplace.catalog.repository;

import com.marketplace.catalog.model.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;

public interface ProductRepository extends JpaRepository<Product, Long> {

    Page<Product> findByVendorId(Long vendorId, Pageable pageable);

    Optional<Product> findByVendorIdAndSku(Long vendorId, String sku);

    boolean existsByVendorIdAndSku(Long vendorId, String sku);

    Page<Product> findByCategoryIdAndStatus(Long categoryId, Product.ProductStatus status, Pageable pageable);

    // Atomic conditional decrement: the WHERE clause makes this safe under concurrency without
    // a pessimistic DB lock. If two orders race for the last unit, only one UPDATE affects a row -
    // the second returns 0 and the service layer treats that as "insufficient stock", not a silent oversell.
    @Modifying
    @Query("""
           UPDATE Product p SET p.stockQuantity = p.stockQuantity - :qty
           WHERE p.id = :productId AND p.stockQuantity >= :qty
           """)
    int decrementStock(@Param("productId") Long productId, @Param("qty") Integer qty);

    // Complement to decrementStock - restores stock when a reserved order doesn't complete
    // (payment failure, cancellation). No conditional guard needed here since we're always
    // adding back a quantity we know was validly decremented earlier.
    @Modifying
    @Query("UPDATE Product p SET p.stockQuantity = p.stockQuantity + :qty WHERE p.id = :productId")
    int incrementStock(@Param("productId") Long productId, @Param("qty") Integer qty);

    @Query("""
           SELECT p FROM Product p
           WHERE p.status = 'ACTIVE'
             AND (:categoryId IS NULL OR p.categoryId = :categoryId)
             AND (:minPrice IS NULL OR p.price >= :minPrice)
             AND (:maxPrice IS NULL OR p.price <= :maxPrice)
             AND (:search IS NULL OR LOWER(p.name) LIKE LOWER(CONCAT('%', :search, '%')))
           """)
    Page<Product> search(
            @Param("categoryId") Long categoryId,
            @Param("minPrice") BigDecimal minPrice,
            @Param("maxPrice") BigDecimal maxPrice,
            @Param("search") String search,
            Pageable pageable
    );
}
