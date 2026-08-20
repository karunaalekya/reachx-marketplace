package com.marketplace.vendor.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record VendorRegistrationRequest(

        @NotBlank(message = "Business name is required")
        @Size(max = 255)
        String businessName,

        @NotBlank(message = "Email is required")
        @Email(message = "Email must be valid")
        String email,

        @NotBlank(message = "Phone is required")
        @Pattern(regexp = "^[6-9]\\d{9}$", message = "Enter a valid 10-digit Indian mobile number")
        String phone,

        @NotBlank(message = "Password is required")
        @Size(min = 8, message = "Password must be at least 8 characters")
        String password,

        @Pattern(regexp = "^[0-9A-Z]{15}$", message = "GSTIN must be 15 characters")
        String gstin,

        @Pattern(regexp = "^[A-Z]{5}[0-9]{4}[A-Z]{1}$", message = "PAN must be a valid format (e.g. ABCDE1234F)")
        String panNumber
) {}
