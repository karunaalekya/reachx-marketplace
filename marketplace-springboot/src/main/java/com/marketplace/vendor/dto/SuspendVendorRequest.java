package com.marketplace.vendor.dto;

import jakarta.validation.constraints.NotBlank;

public record SuspendVendorRequest(
        @NotBlank(message = "A reason is required to suspend a vendor")
        String reason
) {}
