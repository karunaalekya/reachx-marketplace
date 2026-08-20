package com.marketplace.auth;

import com.marketplace.admin.repository.AdminRepository;
import com.marketplace.auth.model.PasswordResetToken;
import com.marketplace.auth.repository.PasswordResetTokenRepository;
import com.marketplace.auth.service.PasswordResetService;
import com.marketplace.common.email.EmailService;
import com.marketplace.common.exception.InvalidCredentialsException;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock private VendorRepository vendorRepository;
    @Mock private AdminRepository adminRepository;
    @Mock private PasswordResetTokenRepository tokenRepository;
    @Mock private PasswordEncoder passwordEncoder;
    @Mock private EmailService emailService;

    private PasswordResetService service() {
        return new PasswordResetService(vendorRepository, adminRepository, tokenRepository, passwordEncoder, emailService);
    }

    @Test
    void requestReset_sendsEmail_whenVendorEmailExists() {
        Vendor vendor = Vendor.builder().id(1L).email("vendor@test.com").build();
        when(vendorRepository.findByEmail("vendor@test.com")).thenReturn(Optional.of(vendor));

        service().requestReset("vendor@test.com");

        verify(emailService).send(eq("vendor@test.com"), anyString(), anyString());
        verify(tokenRepository).save(any(PasswordResetToken.class));
    }

    @Test
    void requestReset_doesNotSendEmail_whenEmailNotFound_butDoesNotThrow() {
        // This is the account-enumeration protection: an unknown email must behave observably
        // identically from the caller's perspective (no exception, same eventual HTTP response
        // in the controller) - the only difference is internal (no email sent, no token created).
        when(vendorRepository.findByEmail("nobody@test.com")).thenReturn(Optional.empty());
        when(adminRepository.findByEmailAndActiveTrue("nobody@test.com")).thenReturn(Optional.empty());

        service().requestReset("nobody@test.com");   // must not throw

        verify(emailService, never()).send(anyString(), anyString(), anyString());
        verify(tokenRepository, never()).save(any());
    }

    @Test
    void resetPassword_throwsInvalidCredentials_whenTokenNotFound() {
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThrows(InvalidCredentialsException.class,
                () -> service().resetPassword("bogus-token", "NewPassword123"));
    }

    @Test
    void resetPassword_throwsInvalidCredentials_whenTokenExpired() {
        PasswordResetToken expiredToken = PasswordResetToken.builder()
                .id(1L).userType(PasswordResetToken.UserType.VENDOR).userId(1L)
                .tokenHash("hash").expiresAt(Instant.now().minus(1, ChronoUnit.HOURS))
                .build();
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(expiredToken));

        assertThrows(InvalidCredentialsException.class,
                () -> service().resetPassword("some-token", "NewPassword123"));
    }

    @Test
    void resetPassword_throwsInvalidCredentials_whenTokenAlreadyUsed() {
        PasswordResetToken usedToken = PasswordResetToken.builder()
                .id(1L).userType(PasswordResetToken.UserType.VENDOR).userId(1L)
                .tokenHash("hash").expiresAt(Instant.now().plus(10, ChronoUnit.MINUTES))
                .usedAt(Instant.now().minus(5, ChronoUnit.MINUTES))
                .build();
        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(usedToken));

        assertThrows(InvalidCredentialsException.class,
                () -> service().resetPassword("some-token", "NewPassword123"));
    }

    @Test
    void resetPassword_updatesVendorPasswordAndMarksTokenUsed_whenValid() {
        Vendor vendor = Vendor.builder().id(1L).email("vendor@test.com").passwordHash("oldhash").build();
        PasswordResetToken token = PasswordResetToken.builder()
                .id(1L).userType(PasswordResetToken.UserType.VENDOR).userId(1L)
                .tokenHash("hash").expiresAt(Instant.now().plus(10, ChronoUnit.MINUTES))
                .build();

        when(tokenRepository.findByTokenHash(anyString())).thenReturn(Optional.of(token));
        when(vendorRepository.findById(1L)).thenReturn(Optional.of(vendor));
        when(passwordEncoder.encode("NewPassword123")).thenReturn("newhash");

        service().resetPassword("some-token", "NewPassword123");

        verify(vendorRepository).save(argThat(v -> "newhash".equals(v.getPasswordHash())));
        verify(tokenRepository).save(argThat(PasswordResetToken::isUsed));
    }
}
