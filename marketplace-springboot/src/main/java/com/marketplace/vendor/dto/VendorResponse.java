package com.marketplace.vendor.dto;

import com.marketplace.vendor.model.Vendor;

import java.math.BigDecimal;
import java.time.Instant;

public record VendorResponse(
        Long id,
        String businessName,
        String email,
        String phone,
        String kycStatus,
        String status,
        BigDecimal commissionRate,
        String addressLine1,
        String addressLine2,
        String city,
        String state,
        String pincode,
        String pickupLocationName,
        boolean emailVerified,
        // Boolean, not the raw PAN number - the frontend needs this to predict which TDS rate
        // (Sec 194-O 1% with PAN vs Sec 206AA 5% without) TaxWithholdingService will actually
        // apply, e.g. in a pre-payout estimate. The PAN itself has no reason to leave the
        // backend for that use case.
        boolean panOnFile,
        Instant createdAt
) {
    public static VendorResponse from(Vendor vendor) {
        return new VendorResponse(
                vendor.getId(),
                vendor.getBusinessName(),
                vendor.getEmail(),
                vendor.getPhone(),
                vendor.getKycStatus().name(),
                vendor.getStatus().name(),
                vendor.getCommissionRate(),
                vendor.getAddressLine1(),
                vendor.getAddressLine2(),
                vendor.getCity(),
                vendor.getState(),
                vendor.getPincode(),
                vendor.getPickupLocationName(),
                vendor.isEmailVerified(),
                vendor.getPanNumber() != null && !vendor.getPanNumber().isBlank(),
                vendor.getCreatedAt()
        );
    }
}
