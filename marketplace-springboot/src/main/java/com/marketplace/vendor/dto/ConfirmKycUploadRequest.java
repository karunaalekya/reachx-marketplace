package com.marketplace.vendor.dto;

import jakarta.validation.constraints.NotBlank;

// Same trust model as catalog's ConfirmImageUploadRequest: the client sends back only the
// objectKey it was issued in the presign step, never a URL of its own choosing - the service
// derives the public URL server-side and verifies the key's namespace before trusting it.
public record ConfirmKycUploadRequest(
        @NotBlank(message = "objectKey is required")
        String objectKey
) {}
