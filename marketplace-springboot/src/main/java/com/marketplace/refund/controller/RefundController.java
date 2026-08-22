package com.marketplace.refund.controller;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.common.security.CurrentVendor;
import com.marketplace.refund.model.Refund;
import com.marketplace.refund.repository.RefundRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

// Deliberately thin: the actual refund business logic (vendor-scoped amount calculation,
// gateway call, order/commission-record status updates) already exists and is exercised in
// production via DisputeService -> RefundService.initiateRefund(), triggered when an admin
// resolves a dispute as RESOLVED_REFUNDED. This controller does not duplicate or expose that
// trigger directly - it only makes what already happened visible. No mutating endpoint here,
// same reasoning AdminTaxWithholdingPanel's backing controller had for being read-only: nothing
// in this session plan calls for a manual "start a refund with no dispute" admin action.
//
// vendor_id + the (order_id, vendor_id) idempotency fix landed in V20 - see that migration and
// RefundService.initiateRefund() for what this unblocks: mine() below was not buildable
// correctly before V20, because a vendor's refund on a multi-vendor order could not be
// distinguished from another vendor's refund on the same order.
@RestController
@RequestMapping("/api/v1/refunds")
@RequiredArgsConstructor
public class RefundController {

    private final RefundRepository refundRepository;

    // Vendor: their own refunds - the endpoint the vendor payments/refunds screen needs.
    // Ordering/paging left to the caller via Pageable, same pattern as GET /orders/mine.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<Refund>> mine(@CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(refundRepository.findByVendorId(vendorId, pageable));
    }

    // Admin: every refund for an order, across all vendors in that order - a multi-vendor order
    // can now legitimately have more than one refund row (one per vendor), so this returns a
    // list, not a single Refund the way the pre-V20 findByOrderId shape implied.
    @GetMapping("/order/{orderId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<Refund>> byOrder(@PathVariable Long orderId) {
        return ResponseEntity.ok(refundRepository.findAllByOrderId(orderId));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Refund> byId(@PathVariable Long id) {
        Refund refund = refundRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Refund not found with id: " + id));
        return ResponseEntity.ok(refund);
    }
}
