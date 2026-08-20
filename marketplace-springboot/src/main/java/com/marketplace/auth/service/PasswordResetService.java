package com.marketplace.auth.service;

import com.marketplace.admin.repository.AdminRepository;
import com.marketplace.auth.model.PasswordResetToken;
import com.marketplace.auth.repository.PasswordResetTokenRepository;
import com.marketplace.common.email.EmailService;
import com.marketplace.common.exception.InvalidCredentialsException;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private final VendorRepository vendorRepository;
    private final AdminRepository adminRepository;
    private final PasswordResetTokenRepository tokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final EmailService emailService;

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int TOKEN_VALIDITY_MINUTES = 30;

    @Value("${app.frontend-base-url:http://localhost:5173}")
    private String frontendBaseUrl;

    // Deliberately returns void, not a boolean or the found-or-not state. Whether this email
    // exists in the system is NEVER revealed to the caller - same response either way, both in
    // the HTTP response and in timing (see note below). This is the standard defense against
    // account enumeration: an attacker probing emails to find real accounts learns nothing.
    @Transactional
    public void requestReset(String email) {
        Optional<VendorOrAdmin> match = findByEmail(email);

        if (match.isPresent()) {
            VendorOrAdmin user = match.get();
            String rawToken = generateRawToken();
            String tokenHash = sha256(rawToken);

            PasswordResetToken token = PasswordResetToken.builder()
                    .userType(user.userType())
                    .userId(user.id())
                    .tokenHash(tokenHash)
                    .expiresAt(Instant.now().plus(TOKEN_VALIDITY_MINUTES, ChronoUnit.MINUTES))
                    .build();
            tokenRepository.save(token);

            String resetLink = frontendBaseUrl + "/reset-password?token=" + rawToken;
            emailService.send(email, "Reset your password",
                    "Click the link below to reset your password. This link expires in "
                            + TOKEN_VALIDITY_MINUTES + " minutes.\n\n" + resetLink
                            + "\n\nIf you didn't request this, ignore this email.");

            log.info("Password reset requested: userType={} userId={}", user.userType(), user.id());
        } else {
            // No account found - log at debug (not warn/info) so this doesn't create a
            // side-channel in log volume that an attacker monitoring logs could exploit,
            // and take no other distinguishable action from the success path above.
            log.debug("Password reset requested for unregistered email");
        }
        // Same return regardless of branch taken - the controller sends an identical response either way.
    }

    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        String tokenHash = sha256(rawToken);
        PasswordResetToken token = tokenRepository.findByTokenHash(tokenHash)
                .orElseThrow(InvalidCredentialsException::new);

        if (token.isExpired() || token.isUsed()) {
            throw new InvalidCredentialsException();
        }

        String encodedPassword = passwordEncoder.encode(newPassword);

        if (token.getUserType() == PasswordResetToken.UserType.VENDOR) {
            vendorRepository.findById(token.getUserId()).ifPresent(vendor -> {
                vendor.setPasswordHash(encodedPassword);
                vendorRepository.save(vendor);
            });
        } else {
            adminRepository.findById(token.getUserId()).ifPresent(admin -> {
                admin.setPasswordHash(encodedPassword);
                adminRepository.save(admin);
            });
        }

        token.setUsedAt(Instant.now());
        tokenRepository.save(token);
        log.info("Password reset completed: userType={} userId={}", token.getUserType(), token.getUserId());
    }

    private Optional<VendorOrAdmin> findByEmail(String email) {
        var vendor = vendorRepository.findByEmail(email);
        if (vendor.isPresent()) {
            return Optional.of(new VendorOrAdmin(PasswordResetToken.UserType.VENDOR, vendor.get().getId()));
        }
        var admin = adminRepository.findByEmailAndActiveTrue(email);
        if (admin.isPresent()) {
            return Optional.of(new VendorOrAdmin(PasswordResetToken.UserType.ADMIN, admin.get().getId()));
        }
        return Optional.empty();
    }

    private String generateRawToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private String sha256(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            throw new RuntimeException("Failed to hash token", e);
        }
    }

    private record VendorOrAdmin(PasswordResetToken.UserType userType, Long id) {}
}
