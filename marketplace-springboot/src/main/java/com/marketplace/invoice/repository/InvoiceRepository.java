package com.marketplace.invoice.repository;

import com.marketplace.invoice.model.Invoice;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    Page<Invoice> findByVendorId(Long vendorId, Pageable pageable);

    List<Invoice> findByOrderId(Long orderId);

    Optional<Invoice> findByOrderIdAndVendorId(Long orderId, Long vendorId);

    boolean existsByOrderIdAndVendorId(Long orderId, Long vendorId);
}
