package com.marketplace.payout.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterPayoutAccountRequest(

        @NotBlank(message = "Account holder name is required")
        @Size(max = 255)
        String accountHolderName,

        // Required unless vpa is supplied instead - checked in the service, not here, since
        // "one of two fields required" isn't expressible cleanly with field-level annotations.
        @Pattern(regexp = "^[0-9]{9,18}$", message = "Account number must be 9-18 digits")
        String accountNumber,

        @Pattern(regexp = "^[A-Z]{4}0[A-Z0-9]{6}$", message = "IFSC must be a valid format (e.g. HDFC0001234)")
        String ifscCode,

        String bankName,

        String accountType,   // SAVINGS | CURRENT - required if accountNumber is supplied

        // Alternative to accountNumber/ifscCode - a vendor can register a UPI VPA instead of a
        // bank account. Exactly one of (accountNumber+ifscCode) or (vpa) must be present.
        @Pattern(regexp = "^[\\w.\\-]{2,256}@[a-zA-Z]{2,64}$", message = "VPA must be a valid UPI address (e.g. name@bank)")
        String vpa
) {}
