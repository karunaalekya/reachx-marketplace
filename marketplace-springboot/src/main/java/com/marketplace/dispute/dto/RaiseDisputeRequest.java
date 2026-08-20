package com.marketplace.dispute.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record RaiseDisputeRequest(
        @NotNull Long orderId,
        @NotNull Long vendorId,
        @NotBlank @Email String raisedByEmail,
        @NotBlank String category,
        @NotBlank @Size(max = 2000) String description
) {}
