package com.marketplace.vendor.repository;

import com.marketplace.vendor.model.Vendor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VendorRepository extends JpaRepository<Vendor, Long> {

    Optional<Vendor> findByEmail(String email);

    boolean existsByEmail(String email);

    Page<Vendor> findByKycStatus(Vendor.KycStatus kycStatus, Pageable pageable);

    Page<Vendor> findByStatus(Vendor.VendorStatus status, Pageable pageable);

    Optional<Vendor> findByVerificationTokenHash(String verificationTokenHash);
}
