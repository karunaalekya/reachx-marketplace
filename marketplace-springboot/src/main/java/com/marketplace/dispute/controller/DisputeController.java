package com.marketplace.dispute.controller;

import com.marketplace.common.security.CurrentAdmin;
import com.marketplace.common.security.CurrentVendor;
import com.marketplace.dispute.dto.DisputeResponse;
import com.marketplace.dispute.dto.RaiseDisputeRequest;
import com.marketplace.dispute.dto.ResolveDisputeRequest;
import com.marketplace.dispute.model.Dispute;
import com.marketplace.dispute.service.DisputeService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/disputes")
@RequiredArgsConstructor
public class DisputeController {

    private final DisputeService disputeService;

    // Public: a customer raising a dispute doesn't need a vendor/admin account.
    @PostMapping
    public ResponseEntity<DisputeResponse> raise(@Valid @RequestBody RaiseDisputeRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(disputeService.raise(request));
    }

    // Vendor's own disputes.
    @GetMapping("/mine")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Page<DisputeResponse>> mine(@CurrentVendor Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(disputeService.findByVendor(vendorId, pageable));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DisputeResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(disputeService.getById(id));
    }

    @GetMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<DisputeResponse>> byStatus(
            @RequestParam(defaultValue = "OPEN") String status, Pageable pageable) {
        return ResponseEntity.ok(disputeService.findByStatus(Dispute.DisputeStatus.valueOf(status), pageable));
    }

    @PatchMapping("/{id}/resolve")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<DisputeResponse> resolve(
            @CurrentAdmin Long adminId,
            @PathVariable Long id,
            @Valid @RequestBody ResolveDisputeRequest request) {
        return ResponseEntity.ok(disputeService.resolve(id, adminId, request));
    }
}
