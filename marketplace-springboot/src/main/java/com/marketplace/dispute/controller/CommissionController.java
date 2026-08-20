package com.marketplace.dispute.controller;

import com.marketplace.common.security.CurrentVendor;
import com.marketplace.dispute.dto.CommissionRecordResponse;
import com.marketplace.dispute.service.CommissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/commissions")
@RequiredArgsConstructor
public class CommissionController {

    private final CommissionService commissionService;

    // Vendor's own commission/payout ledger.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<CommissionRecordResponse>> mine(@CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(commissionService.findByVendor(vendorId, pageable).map(CommissionRecordResponse::from));
    }

    @GetMapping("/mine/pending-total")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Map<String, BigDecimal>> myPendingTotal(@CurrentVendor Long vendorId) {
        return ResponseEntity.ok(Map.of("pendingPayout", commissionService.getPendingPayoutTotal(vendorId)));
    }

    // Admin: any vendor's ledger, for reconciliation/support.
    @GetMapping("/vendor/{vendorId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<CommissionRecordResponse>> byVendor(
            @PathVariable Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(commissionService.findByVendor(vendorId, pageable).map(CommissionRecordResponse::from));
    }
}
