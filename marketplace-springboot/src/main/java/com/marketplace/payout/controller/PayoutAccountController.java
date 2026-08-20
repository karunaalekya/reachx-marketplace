package com.marketplace.payout.controller;

import com.marketplace.common.security.CurrentVendor;
import com.marketplace.payout.dto.PayoutAccountResponse;
import com.marketplace.payout.dto.RegisterPayoutAccountRequest;
import com.marketplace.payout.service.VendorPayoutAccountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/vendors/me/payout-account")
@RequiredArgsConstructor
public class PayoutAccountController {

    private final VendorPayoutAccountService payoutAccountService;

    // Vendor self-service only - the JWT subject IS the vendor id, so there's no {id} path
    // param to potentially mismatch against another vendor's account the way updateAddress had
    // to guard against explicitly. Bank details are sensitive enough that this endpoint doesn't
    // even accept a target vendor id from the caller.
    @PostMapping
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<PayoutAccountResponse> register(
            @CurrentVendor Long vendorId,
            @Valid @RequestBody RegisterPayoutAccountRequest request) {
        return ResponseEntity.ok(payoutAccountService.register(vendorId, request));
    }

    @GetMapping
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<PayoutAccountResponse> getMine(@CurrentVendor Long vendorId) {
        return ResponseEntity.ok(payoutAccountService.getActiveForVendor(vendorId));
    }
}
