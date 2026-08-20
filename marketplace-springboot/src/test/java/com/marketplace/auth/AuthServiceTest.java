package com.marketplace.auth;

import com.marketplace.admin.model.Admin;
import com.marketplace.admin.repository.AdminRepository;
import com.marketplace.auth.dto.LoginRequest;
import com.marketplace.auth.dto.LoginResponse;
import com.marketplace.auth.service.AuthService;
import com.marketplace.common.exception.InvalidCredentialsException;
import com.marketplace.common.security.JwtService;
import com.marketplace.common.security.LoginAttemptLimiter;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock private VendorRepository vendorRepository;
    @Mock private AdminRepository adminRepository;
    @Mock private org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
    @Mock private JwtService jwtService;
    @Mock private LoginAttemptLimiter loginAttemptLimiter;

    private AuthService authService() {
        // No explicit isLocked() stub needed here: Mockito returns false by default for an
        // unstubbed boolean method, which is exactly what every test except the lockout test
        // below needs. Stubbing it here too would risk Mockito's most-recent-stub-wins
        // behavior silently overriding the lockout test's specific stub, depending on call order.
        return new AuthService(vendorRepository, adminRepository, passwordEncoder, jwtService, loginAttemptLimiter);
    }

    @Test
    void login_returnsVendorToken_whenCredentialsCorrect() {
        Vendor vendor = Vendor.builder()
                .id(1L).businessName("Test Traders").email("v@test.com")
                .passwordHash("hashed").status(Vendor.VendorStatus.ACTIVE)
                .build();

        when(vendorRepository.findByEmail("v@test.com")).thenReturn(Optional.of(vendor));
        when(passwordEncoder.matches("plain", "hashed")).thenReturn(true);
        when(jwtService.generateToken(1L, List.of("VENDOR"))).thenReturn("fake-jwt");

        LoginResponse response = authService().login(new LoginRequest("v@test.com", "plain"));

        assertEquals("fake-jwt", response.token());
        assertEquals("VENDOR", response.role());
    }

    @Test
    void login_throwsInvalidCredentials_whenPasswordWrong() {
        Vendor vendor = Vendor.builder()
                .id(1L).businessName("Test Traders").email("v@test.com")
                .passwordHash("hashed").status(Vendor.VendorStatus.ACTIVE)
                .build();

        when(vendorRepository.findByEmail("v@test.com")).thenReturn(Optional.of(vendor));
        when(passwordEncoder.matches("wrong", "hashed")).thenReturn(false);

        assertThrows(InvalidCredentialsException.class,
                () -> authService().login(new LoginRequest("v@test.com", "wrong")));
    }

    @Test
    void login_throwsInvalidCredentials_whenEmailNotFoundAnywhere() {
        when(vendorRepository.findByEmail("nobody@test.com")).thenReturn(Optional.empty());
        when(adminRepository.findByEmailAndActiveTrue("nobody@test.com")).thenReturn(Optional.empty());

        assertThrows(InvalidCredentialsException.class,
                () -> authService().login(new LoginRequest("nobody@test.com", "anything")));
    }

    @Test
    void login_returnsAdminToken_whenEmailMatchesAdminNotVendor() {
        Admin admin = Admin.builder()
                .id(9L).email("admin@test.com").passwordHash("hashed").fullName("Ops Admin")
                .active(true).build();

        when(vendorRepository.findByEmail("admin@test.com")).thenReturn(Optional.empty());
        when(adminRepository.findByEmailAndActiveTrue("admin@test.com")).thenReturn(Optional.of(admin));
        when(passwordEncoder.matches("plain", "hashed")).thenReturn(true);
        when(jwtService.generateToken(9L, List.of("ADMIN"))).thenReturn("admin-jwt");

        LoginResponse response = authService().login(new LoginRequest("admin@test.com", "plain"));

        assertEquals("admin-jwt", response.token());
        assertEquals("ADMIN", response.role());
    }

    @Test
    void login_throwsAccountLocked_whenTooManyFailedAttempts() {
        when(loginAttemptLimiter.isLocked("locked@test.com")).thenReturn(true);

        assertThrows(com.marketplace.common.exception.AccountLockedException.class,
                () -> authService().login(new LoginRequest("locked@test.com", "anything")));
    }
}
