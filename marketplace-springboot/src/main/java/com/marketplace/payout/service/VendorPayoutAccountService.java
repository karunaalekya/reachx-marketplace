package com.marketplace.payout.service;

import com.marketplace.common.exception.ResourceNotFoundException;
import com.marketplace.payout.dto.PayoutAccountResponse;
import com.marketplace.payout.dto.RegisterPayoutAccountRequest;
import com.marketplace.payout.gateway.PayoutGateway;
import com.marketplace.payout.gateway.PayoutGatewayException;
import com.marketplace.payout.model.VendorPayoutAccount;
import com.marketplace.payout.repository.VendorPayoutAccountRepository;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;

@Service
@Slf4j
public class VendorPayoutAccountService {

    private final VendorPayoutAccountRepository payoutAccountRepository;
    private final VendorRepository vendorRepository;
    private final Map<String, PayoutGateway> gateways;   // beanName -> gateway, e.g. "cashfreePayoutGateway"

    // Which gateway new beneficiary registrations use - a single active choice for the whole
    // platform (not per-vendor), matching how the locked decision frames this as one primary
    // integration with an alternate, not a vendor-selectable option. Switching this later
    // doesn't affect already-registered accounts, which keep their own stored `gateway` value.
    @Value("${payout.active-gateway:CASHFREE}")
    private String activeGatewayName;

    public VendorPayoutAccountService(VendorPayoutAccountRepository payoutAccountRepository,
                                       VendorRepository vendorRepository,
                                       Map<String, PayoutGateway> gateways) {
        this.payoutAccountRepository = payoutAccountRepository;
        this.vendorRepository = vendorRepository;
        this.gateways = gateways;
    }

    private PayoutGateway resolveActiveGateway() {
        String beanName = activeGatewayName.equalsIgnoreCase("RAZORPAYX") ? "razorpayxGateway" : "cashfreePayoutGateway";
        PayoutGateway gateway = gateways.get(beanName);
        if (gateway == null) {
            throw new IllegalStateException("No payout gateway implementation registered for: " + activeGatewayName);
        }
        return gateway;
    }

    // Vendor self-service: register or replace their payout bank/UPI details. Registering new
    // details deactivates any existing active account for this vendor (kept for audit history,
    // see V14 migration) rather than overwriting it, and immediately attempts beneficiary
    // registration with the gateway so a bad IFSC/VPA is caught here - at onboarding time - not
    // discovered later as a failed payout.
    @Transactional
    public PayoutAccountResponse register(Long vendorId, RegisterPayoutAccountRequest request) {
        Vendor vendor = vendorRepository.findById(vendorId)
                .orElseThrow(() -> new ResourceNotFoundException("Vendor not found with id: " + vendorId));

        boolean hasBankDetails = request.accountNumber() != null && !request.accountNumber().isBlank()
                && request.ifscCode() != null && !request.ifscCode().isBlank();
        boolean hasVpa = request.vpa() != null && !request.vpa().isBlank();

        if (hasBankDetails == hasVpa) {
            // Both supplied, or neither - exactly one path is valid. This can't be expressed
            // with plain @Pattern/@NotBlank annotations on the DTO (they'd make both fields
            // unconditionally required), so it's checked here instead.
            throw new IllegalArgumentException(
                    "Provide either a bank account (accountNumber + ifscCode) or a UPI vpa, not both or neither");
        }
        if (hasBankDetails && (request.accountType() == null || request.accountType().isBlank())) {
            throw new IllegalArgumentException("accountType is required when registering a bank account");
        }

        payoutAccountRepository.findByVendorIdAndActiveTrue(vendorId).ifPresent(existing -> {
            existing.setActive(false);
            payoutAccountRepository.save(existing);
            log.info("Deactivated previous payout account: vendorId={} previousAccountId={}", vendorId, existing.getId());
        });

        PayoutGateway gateway = resolveActiveGateway();
        VendorPayoutAccount.Gateway gatewayEnum =
                gateway == gateways.get("razorpayxGateway") ? VendorPayoutAccount.Gateway.RAZORPAYX
                        : VendorPayoutAccount.Gateway.CASHFREE;

        VendorPayoutAccount account = VendorPayoutAccount.builder()
                .vendorId(vendorId)
                .accountHolderName(request.accountHolderName())
                .accountNumber(hasBankDetails ? request.accountNumber() : "")
                .accountNumberLast4(hasBankDetails
                        ? request.accountNumber().substring(request.accountNumber().length() - 4)
                        : "0000")
                .ifscCode(hasBankDetails ? request.ifscCode() : "")
                .bankName(request.bankName())
                .accountType(hasBankDetails ? VendorPayoutAccount.AccountType.valueOf(request.accountType()) : null)
                .vpa(hasVpa ? request.vpa() : null)
                .gateway(gatewayEnum)
                .beneficiaryStatus(VendorPayoutAccount.BeneficiaryStatus.PENDING)
                .active(true)
                .build();

        try {
            PayoutGateway.BeneficiaryResult result = gateway.registerBeneficiary(new PayoutGateway.BeneficiaryRequest(
                    vendorId.toString(),
                    request.accountHolderName(),
                    hasBankDetails ? request.accountNumber() : null,
                    hasBankDetails ? request.ifscCode() : null,
                    hasVpa ? request.vpa() : null,
                    vendor.getEmail(),
                    vendor.getPhone()
            ));

            account.setBeneficiaryId(result.beneficiaryId());
            account.setBeneficiaryStatus(result.verified()
                    ? VendorPayoutAccount.BeneficiaryStatus.VERIFIED
                    : VendorPayoutAccount.BeneficiaryStatus.REJECTED);
            if (!result.verified()) {
                account.setRejectionReason("Gateway did not confirm this beneficiary as verified - check bank/VPA details and resubmit");
            }
        } catch (PayoutGatewayException e) {
            // Registration failing must not throw and lose the vendor's submission entirely -
            // save it as REJECTED with the reason, so the vendor sees exactly what to fix rather
            // than a generic 500 and has to guess. They can call this endpoint again to retry.
            log.warn("Payout beneficiary registration failed for vendorId={}: {}", vendorId, e.getMessage());
            account.setBeneficiaryStatus(VendorPayoutAccount.BeneficiaryStatus.REJECTED);
            account.setRejectionReason(e.getMessage());
        }

        VendorPayoutAccount saved = payoutAccountRepository.save(account);
        log.info("Vendor payout account registered: vendorId={} accountId={} status={}",
                vendorId, saved.getId(), saved.getBeneficiaryStatus());
        return PayoutAccountResponse.from(saved);
    }

    public PayoutAccountResponse getActiveForVendor(Long vendorId) {
        VendorPayoutAccount account = payoutAccountRepository.findByVendorIdAndActiveTrue(vendorId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No payout account on file for vendor id: " + vendorId));
        return PayoutAccountResponse.from(account);
    }
}
