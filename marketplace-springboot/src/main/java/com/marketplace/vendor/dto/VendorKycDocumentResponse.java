package com.marketplace.vendor.dto;

import com.marketplace.vendor.model.VendorKycDocument;

import java.time.Instant;

public record VendorKycDocumentResponse(
        Long id,
        String docType,
        boolean required,
        String documentUrl,
        String status,
        String rejectionReason,
        Instant uploadedAt,
        Instant decidedAt
) {
    public static VendorKycDocumentResponse from(VendorKycDocument doc) {
        return new VendorKycDocumentResponse(
                doc.getId(),
                doc.getDocType().name(),
                doc.getDocType().isRequired(),
                doc.getDocumentUrl(),
                doc.getStatus().name(),
                doc.getRejectionReason(),
                doc.getUploadedAt(),
                doc.getDecidedAt()
        );
    }
}
