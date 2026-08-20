package com.marketplace.vendor.controller;

import com.marketplace.catalog.dto.PresignedUploadResponse;
import com.marketplace.vendor.dto.AccountHealthResponse;
import com.marketplace.vendor.dto.ConfirmKycUploadRequest;
import com.marketplace.vendor.dto.KycDocumentDecisionRequest;
import com.marketplace.vendor.dto.KycPresignedUploadRequest;
import com.marketplace.vendor.dto.UpdateCommissionRateRequest;
import com.marketplace.vendor.dto.UpdateVendorAddressRequest;
import com.marketplace.vendor.dto.VendorKycDocumentResponse;
import com.marketplace.vendor.dto.VendorRegistrationRequest;
import com.marketplace.vendor.dto.VendorResponse;
import com.marketplace.vendor.service.AccountHealthService;
import com.marketplace.vendor.service.VendorService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/vendors")
@RequiredArgsConstructor
public class VendorController {

    private final VendorService vendorService;
    private final AccountHealthService accountHealthService;

    @PostMapping("/register")
    public ResponseEntity<VendorResponse> register(@Valid @RequestBody VendorRegistrationRequest request) {
        VendorResponse response = vendorService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @PostMapping("/verify-email")
    public ResponseEntity<java.util.Map<String, String>> verifyEmail(@RequestParam String token) {
        vendorService.verifyEmail(token);
        return ResponseEntity.ok(java.util.Map.of("message", "Email verified successfully."));
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'VENDOR')")
    public ResponseEntity<VendorResponse> getById(@PathVariable Long id) {
        return ResponseEntity.ok(vendorService.getById(id));
    }

    // Composite 0-100 score (KYC 40% + fulfilment 40% + disputes 20%) shown on the vendor
    // dashboard - computed fresh on every request, nothing stored. Mirrors getById's access
    // pattern (ADMIN or VENDOR, no extra self-check) rather than introducing a new authorization
    // style for this one endpoint. See AccountHealthService for the formula.
    @GetMapping("/{id}/account-health")
    @PreAuthorize("hasAnyRole('ADMIN', 'VENDOR')")
    public ResponseEntity<AccountHealthResponse> accountHealth(@PathVariable Long id) {
        return ResponseEntity.ok(accountHealthService.compute(id));
    }

    @GetMapping("/pending-kyc")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<VendorResponse>> pendingKyc(Pageable pageable) {
        return ResponseEntity.ok(vendorService.findPendingKyc(pageable));
    }

    // Self (vendor) or admin: every document slot this vendor has uploaded into, each with its
    // own status/rejection reason. Replaces having to infer per-document state from the old
    // single kycDocumentUrl/kycStatus fields on VendorResponse (those fields no longer exist on
    // Vendor as of V18 - see MASTER_BLUEPRINT.md's breaking-change note).
    @GetMapping("/{id}/kyc-documents")
    @PreAuthorize("hasAnyRole('ADMIN', 'VENDOR')")
    public ResponseEntity<java.util.List<VendorKycDocumentResponse>> listKycDocuments(
            @PathVariable Long id) {
        return ResponseEntity.ok(vendorService.listKycDocuments(id));
    }

    // Admin-only: approve/reject ONE document (PAN / GSTIN / BANK_CHEQUE / MSME_CERTIFICATE),
    // not the whole vendor - replaces the old vendor-level PATCH /kyc-decision, which could only
    // ever approve or reject everything at once and is removed as of this change.
    @PatchMapping("/{id}/kyc-documents/{documentId}/decision")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<VendorKycDocumentResponse> decideKycDocument(
            @PathVariable Long id,
            @PathVariable Long documentId,
            @Valid @RequestBody KycDocumentDecisionRequest decision) {
        return ResponseEntity.ok(vendorService.decideKycDocument(id, documentId, decision));
    }

    @PatchMapping("/{id}/commission-rate")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<VendorResponse> updateCommissionRate(
            @PathVariable Long id,
            @Valid @RequestBody UpdateCommissionRateRequest request) {
        return ResponseEntity.ok(vendorService.updateCommissionRate(id, request.commissionRate()));
    }

    @PatchMapping("/{id}/address")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<VendorResponse> updateAddress(
            @CurrentVendor Long currentVendorId,
            @PathVariable Long id,
            @Valid @RequestBody UpdateVendorAddressRequest request) {
        if (!currentVendorId.equals(id)) {
            throw new org.springframework.security.access.AccessDeniedException("Cannot edit another vendor's address");
        }
        return ResponseEntity.ok(vendorService.updateAddress(id, request));
    }

    // Step 1 of the presigned-upload flow, same shape as
    // ProductImageController#presign. Self-only, same guard as updateAddress above -
    // vendorId is taken from the authenticated token (@CurrentVendor), never trusted from the
    // path, so a vendor can only ever request an upload URL namespaced under their own id.
    @PostMapping("/{id}/kyc-documents/presign")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<PresignedUploadResponse> presignKycUpload(
            @CurrentVendor Long currentVendorId,
            @PathVariable Long id,
            @Valid @RequestBody KycPresignedUploadRequest request) {
        if (!currentVendorId.equals(id)) {
            throw new org.springframework.security.access.AccessDeniedException("Cannot upload KYC documents for another vendor");
        }
        return ResponseEntity.ok(vendorService.createKycPresignedUpload(id, request));
    }

    // Step 2: confirms the file already PUT to the bucket in step 1. Works the same way whether
    // this is a vendor's first submission of a given docType or a re-upload after a rejection -
    // see VendorService#confirmKycUpload for why it always resets that document's status to
    // PENDING. Returns the single document that was just confirmed (docType is recovered from
    // the objectKey itself, not this endpoint's own response) - use GET .../kyc-documents for
    // the full set.
    @PostMapping("/{id}/kyc-documents")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<VendorKycDocumentResponse> confirmKycUpload(
            @CurrentVendor Long currentVendorId,
            @PathVariable Long id,
            @Valid @RequestBody ConfirmKycUploadRequest request) {
        if (!currentVendorId.equals(id)) {
            throw new org.springframework.security.access.AccessDeniedException("Cannot upload KYC documents for another vendor");
        }
        return ResponseEntity.ok(vendorService.confirmKycUpload(id, request));
    }

    @PatchMapping("/{id}/suspend")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<VendorResponse> suspend(
            @PathVariable Long id,
            @Valid @RequestBody com.marketplace.vendor.dto.SuspendVendorRequest request) {
        return ResponseEntity.ok(vendorService.suspend(id, request.reason()));
    }

    @PatchMapping("/{id}/reactivate")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<VendorResponse> reactivate(@PathVariable Long id) {
        return ResponseEntity.ok(vendorService.reactivate(id));
    }
}
