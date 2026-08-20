package com.marketplace.dispute.repository;

import com.marketplace.dispute.model.Dispute;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;

public interface DisputeRepository extends JpaRepository<Dispute, Long> {
    Page<Dispute> findByStatus(Dispute.DisputeStatus status, Pageable pageable);
    Page<Dispute> findByVendorId(Long vendorId, Pageable pageable);

    // Added for account health's dispute-penalty component - Spring Data derives this from the
    // method name, no JPQL needed. Only OPEN/UNDER_REVIEW count against a vendor; a dispute that
    // ended in the vendor's favor (RESOLVED_REJECTED) shouldn't still be penalizing their score.
    long countByVendorIdAndStatusIn(Long vendorId, Collection<Dispute.DisputeStatus> statuses);
}
