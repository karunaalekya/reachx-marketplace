package com.marketplace.vendor.service;

import com.marketplace.dispute.model.Dispute;
import com.marketplace.dispute.repository.DisputeRepository;
import com.marketplace.order.model.Order;
import com.marketplace.order.repository.OrderItemRepository;
import com.marketplace.vendor.dto.AccountHealthResponse;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.List;

// Composite "account health" score shown on the vendor dashboard - not stored, computed fresh on
// every request from data that's already real elsewhere (Vendor.kycStatus, OrderItem, Dispute).
// Nothing here invents a metric the rest of the backend doesn't already track.
//
// Weighting: KYC 40% + fulfilment 40% + disputes 20%. KYC and fulfilment are what actually
// determine whether this vendor should be trusted with the marketplace's customers at all;
// disputes matter but a new vendor with one early dispute shouldn't see their score collapse.
// This is a starting point, not a final formula - flagged in AccountHealthResponse's javadoc too.
@Service
@RequiredArgsConstructor
public class AccountHealthService {

    private static final List<Order.OrderStatus> RESOLVED_STATUSES = List.of(
            Order.OrderStatus.FULFILLED,
            Order.OrderStatus.REFUNDED,
            Order.OrderStatus.PARTIALLY_REFUNDED
    );
    private static final List<Order.OrderStatus> FULFILLED_ONLY = List.of(Order.OrderStatus.FULFILLED);
    private static final List<Dispute.DisputeStatus> OPEN_DISPUTE_STATUSES = List.of(
            Dispute.DisputeStatus.OPEN,
            Dispute.DisputeStatus.UNDER_REVIEW
    );

    private final VendorRepository vendorRepository;
    private final OrderItemRepository orderItemRepository;
    private final DisputeRepository disputeRepository;

    public AccountHealthResponse compute(Long vendorId) {
        Vendor vendor = vendorRepository.findById(vendorId)
                .orElseThrow(() -> new EntityNotFoundException("Vendor not found: " + vendorId));

        int kycScore = kycScore(vendor);
        int fulfilmentScore = fulfilmentScore(vendorId);
        int disputeScore = disputeScore(vendorId);

        int overall = (int) Math.round(kycScore * 0.4 + fulfilmentScore * 0.4 + disputeScore * 0.2);

        return new AccountHealthResponse(overall, ratingFor(overall), kycScore, fulfilmentScore, disputeScore);
    }

    private int kycScore(Vendor vendor) {
        return switch (vendor.getKycStatus()) {
            case APPROVED -> 100;
            case UNDER_REVIEW, PENDING -> 50;
            case REJECTED -> 0;
        };
    }

    private int fulfilmentScore(Long vendorId) {
        long resolved = orderItemRepository.countDistinctOrdersByVendorAndStatusIn(vendorId, RESOLVED_STATUSES);
        // No resolved orders yet (brand-new vendor) - don't penalize for having no track record.
        if (resolved == 0) return 100;
        long fulfilled = orderItemRepository.countDistinctOrdersByVendorAndStatusIn(vendorId, FULFILLED_ONLY);
        return (int) Math.round((fulfilled * 100.0) / resolved);
    }

    private int disputeScore(Long vendorId) {
        long openDisputes = disputeRepository.countByVendorIdAndStatusIn(vendorId, OPEN_DISPUTE_STATUSES);
        // Flat 15-point penalty per open dispute, floored at 0. Simple and explainable; revisit
        // once there's enough real dispute volume to know if this is too harsh or too lenient.
        return Math.max(0, 100 - (int) (openDisputes * 15));
    }

    private String ratingFor(int score) {
        if (score >= 90) return "EXCELLENT";
        if (score >= 75) return "GOOD";
        if (score >= 60) return "NEEDS_ATTENTION";
        return "AT_RISK";
    }
}
