package com.marketplace.vendor.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;

public record UpdateCommissionRateRequest(
        @NotNull
        @DecimalMin(value = "0.0", message = "Commission rate cannot be negative")
        @DecimalMax(value = "100.0", message = "Commission rate cannot exceed 100%")
        BigDecimal commissionRate
) {}
