package com.marketplace.payout.repository;

import com.marketplace.payout.model.Payout;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PayoutRepository extends JpaRepository<Payout, Long> {

    Optional<Payout> findByCommissionRecordId(Long commissionRecordId);

    Optional<Payout> findByGatewayTransferId(String gatewayTransferId);

    Page<Payout> findByVendorId(Long vendorId, Pageable pageable);

    Page<Payout> findByStatus(Payout.PayoutStatus status, Pageable pageable);
}
