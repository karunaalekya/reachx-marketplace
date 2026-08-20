package com.marketplace.catalog.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record PresignedUploadRequest(

        @NotBlank(message = "File name is required")
        String fileName,

        // Whitelisted, not freeform - an image upload endpoint accepting arbitrary content types
        // is an easy way to end up serving something unexpected (e.g. text/html) from the bucket's
        // public URL later.
        @NotBlank(message = "Content type is required")
        @Pattern(
                regexp = "^image/(jpeg|jpg|png|webp)$",
                message = "Only image/jpeg, image/png, and image/webp are allowed"
        )
        String contentType
) {}
