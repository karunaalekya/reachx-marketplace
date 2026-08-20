package com.marketplace.vendor.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record KycPresignedUploadRequest(

        @NotBlank(message = "File name is required")
        String fileName,

        // Same whitelist discipline as ProductImageController's PresignedUploadRequest, extended
        // with application/pdf - KYC documents (GST certificates, bank statements) are commonly
        // scanned as PDFs, not just photographed as images.
        @NotBlank(message = "Content type is required")
        @Pattern(
                regexp = "^(image/(jpeg|jpg|png|webp)|application/pdf)$",
                message = "Only image/jpeg, image/png, image/webp, and application/pdf are allowed"
        )
        String contentType,

        // Which KYC document slot this upload is for (PAN / GSTIN / BANK_CHEQUE /
        // MSME_CERTIFICATE). Embedded into the objectKey path server-side
        // (vendor-kyc/{vendorId}/{docType}/...) so confirmKycUpload can recover it later without
        // trusting a second client-supplied docType at confirm time - see
        // VendorService#confirmKycUpload.
        @NotNull(message = "docType is required")
        com.marketplace.vendor.model.VendorKycDocument.DocType docType
) {}
