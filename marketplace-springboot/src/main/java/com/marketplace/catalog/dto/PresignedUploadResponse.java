package com.marketplace.catalog.dto;

import com.marketplace.catalog.storage.StorageService;

// uploadUrl: where React PUTs the raw file bytes directly (bucket, never touches Spring Boot).
// publicUrl: what React sends back in the follow-up POST /images call to actually save the image.
// objectKey: internal - React doesn't need it, but harmless to expose; not used by the client.
public record PresignedUploadResponse(
        String uploadUrl,
        String publicUrl,
        String objectKey,
        long expiresInSeconds
) {
    public static PresignedUploadResponse from(StorageService.PresignedUpload upload) {
        return new PresignedUploadResponse(
                upload.uploadUrl(),
                upload.publicUrl(),
                upload.objectKey(),
                upload.expiresInSeconds()
        );
    }
}
