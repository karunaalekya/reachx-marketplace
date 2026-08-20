package com.marketplace.payout;

import com.marketplace.payout.dto.PayoutAccountResponse;
import com.marketplace.payout.dto.RegisterPayoutAccountRequest;
import com.marketplace.payout.gateway.PayoutGateway;
import com.marketplace.payout.model.VendorPayoutAccount;
import com.marketplace.payout.repository.VendorPayoutAccountRepository;
import com.marketplace.payout.service.VendorPayoutAccountService;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VendorPayoutAccountServiceTest {

    @Mock private VendorPayoutAccountRepository payoutAccountRepository;
    @Mock private VendorRepository vendorRepository;
    @Mock private PayoutGateway cashfreePayoutGateway;

    private VendorPayoutAccountService service() {
        VendorPayoutAccountService svc = new VendorPayoutAccountService(
                payoutAccountRepository, vendorRepository, Map.of("cashfreePayoutGateway", cashfreePayoutGateway));
        // @Value field - not set by Spring in a plain unit test, so set the default explicitly
        // to mirror application.yml's default (CASHFREE).
        org.springframework.test.util.ReflectionTestUtils.setField(svc, "activeGatewayName", "CASHFREE");
        return svc;
    }

    private Vendor vendor() {
        return Vendor.builder().id(1L).email("v@test.com").phone("9876543210").build();
    }

    @Test
    void register_rejectsRequest_withBothBankAccountAndVpa() {
        RegisterPayoutAccountRequest request = new RegisterPayoutAccountRequest(
                "Test Trader", "123456789012", "HDFC0001234", "HDFC Bank", "SAVINGS", "trader@upi");

        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor()));

        assertThrows(IllegalArgumentException.class, () -> service().register(1L, request));
        verifyNoInteractions(cashfreePayoutGateway);
    }

    @Test
    void register_rejectsRequest_withNeitherBankAccountNorVpa() {
        RegisterPayoutAccountRequest request = new RegisterPayoutAccountRequest(
                "Test Trader", null, null, null, null, null);

        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor()));

        assertThrows(IllegalArgumentException.class, () -> service().register(1L, request));
    }

    @Test
    void register_deactivatesPreviousActiveAccount_beforeCreatingNewOne() {
        RegisterPayoutAccountRequest request = new RegisterPayoutAccountRequest(
                "Test Trader", "123456789012", "HDFC0001234", "HDFC Bank", "SAVINGS", null);

        VendorPayoutAccount previous = VendorPayoutAccount.builder()
                .id(3L).vendorId(1L).active(true)
                .beneficiaryStatus(VendorPayoutAccount.BeneficiaryStatus.VERIFIED)
                .build();

        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor()));
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.of(previous));
        when(payoutAccountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(cashfreePayoutGateway.registerBeneficiary(any()))
                .thenReturn(new PayoutGateway.BeneficiaryResult("VENDOR-1", true, "{}"));

        PayoutAccountResponse result = service().register(1L, request);

        assertFalse(previous.isActive());
        assertEquals("VERIFIED", result.beneficiaryStatus());
        assertEquals("XXXXXXXX9012", result.accountNumberMasked());
    }

    @Test
    void register_marksRejected_ratherThanThrowing_whenGatewayCallFails() {
        RegisterPayoutAccountRequest request = new RegisterPayoutAccountRequest(
                "Test Trader", "123456789012", "HDFC0001234", "HDFC Bank", "SAVINGS", null);

        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor()));
        when(payoutAccountRepository.findByVendorIdAndActiveTrue(1L)).thenReturn(Optional.empty());
        when(payoutAccountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(cashfreePayoutGateway.registerBeneficiary(any()))
                .thenThrow(new com.marketplace.payout.gateway.PayoutGatewayException("Invalid IFSC"));

        PayoutAccountResponse result = service().register(1L, request);

        assertEquals("REJECTED", result.beneficiaryStatus());
        assertEquals("Invalid IFSC", result.rejectionReason());
    }
}
