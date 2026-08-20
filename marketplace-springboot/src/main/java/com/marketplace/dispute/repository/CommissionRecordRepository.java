package com.marketplace.dispute.repository;

import com.marketplace.dispute.model.CommissionRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.Optional;

public interface CommissionRecordRepository extends JpaRepository<CommissionRecord, Long> {

    Optional<CommissionRecord> findByOrderIdAndVendorId(Long orderId, Long vendorId);

    Page<CommissionRecord> findByVendorId(Long vendorId, Pageable pageable);

    @Query("""
           SELECT COALESCE(SUM(c.vendorPayoutAmount), 0) FROM CommissionRecord c
           WHERE c.vendorId = :vendorId AND c.payoutStatus = 'PENDING'
           """)
    BigDecimal sumPendingPayoutForVendor(@Param("vendorId") Long vendorId);
}
