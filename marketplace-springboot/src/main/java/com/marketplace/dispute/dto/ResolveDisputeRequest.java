package com.marketplace.dispute.dto;

import jakarta.validation.constraints.NotBlank;

public record ResolveDisputeRequest(
        @NotBlank String resolution,   // RESOLVED_REFUNDED / RESOLVED_REJECTED / RESOLVED_REPLACED
        @NotBlank String notes
) {}
