package com.marketplace.payout.repository;

import com.marketplace.payout.model.VendorPayoutAccount;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface VendorPayoutAccountRepository extends JpaRepository<VendorPayoutAccount, Long> {

    Optional<VendorPayoutAccount> findByVendorIdAndActiveTrue(Long vendorId);
}
