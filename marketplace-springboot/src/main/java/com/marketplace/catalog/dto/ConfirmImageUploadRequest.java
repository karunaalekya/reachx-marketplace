package com.marketplace.catalog.dto;

import jakarta.validation.constraints.NotBlank;

// Sent after the client has successfully PUT the file to the presigned URL. We deliberately
// don't trust a client-supplied public URL wholesale - only the objectKey is trusted input;
// the service derives the stored imageUrl from it via the same StorageService config used to
// generate the presign, so a client can't point this at an arbitrary external URL.
public record ConfirmImageUploadRequest(

        @NotBlank(message = "objectKey is required")
        String objectKey,

        Integer displayOrder
) {}
