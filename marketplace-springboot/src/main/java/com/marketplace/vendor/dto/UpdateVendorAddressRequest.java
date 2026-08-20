package com.marketplace.vendor.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public record UpdateVendorAddressRequest(
        @NotBlank String addressLine1,
        String addressLine2,
        @NotBlank String city,
        @NotBlank String state,
        @NotBlank @Pattern(regexp = "^[1-9][0-9]{5}$", message = "Enter a valid 6-digit Indian pincode") String pincode,
        @NotBlank(message = "pickupLocationName must match a location registered in your Shiprocket dashboard")
        String pickupLocationName
) {}
