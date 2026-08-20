package com.marketplace.auth.service;

import com.marketplace.admin.model.Admin;
import com.marketplace.admin.repository.AdminRepository;
import com.marketplace.auth.dto.LoginRequest;
import com.marketplace.auth.dto.LoginResponse;
import com.marketplace.common.exception.AccountLockedException;
import com.marketplace.common.exception.InvalidCredentialsException;
import com.marketplace.common.security.JwtService;
import com.marketplace.common.security.LoginAttemptLimiter;
import com.marketplace.vendor.model.Vendor;
import com.marketplace.vendor.repository.VendorRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final VendorRepository vendorRepository;
    private final AdminRepository adminRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final LoginAttemptLimiter loginAttemptLimiter;

    public LoginResponse login(LoginRequest request) {
        if (loginAttemptLimiter.isLocked(request.email())) {
            log.warn("Login blocked - account locked from too many failed attempts: email={}", request.email());
            throw new AccountLockedException(
                    "Too many failed login attempts. Please try again in 15 minutes.");
        }

        try {
            LoginResponse response = attemptLogin(request);
            loginAttemptLimiter.clearOnSuccess(request.email());
            return response;
        } catch (InvalidCredentialsException e) {
            loginAttemptLimiter.recordFailure(request.email());
            throw e;
        }
    }

    private LoginResponse attemptLogin(LoginRequest request) {
        // Check vendor table first (higher volume of logins), then admin.
        var vendorMatch = vendorRepository.findByEmail(request.email());
        if (vendorMatch.isPresent()) {
            return authenticateVendor(vendorMatch.get(), request.password());
        }

        var adminMatch = adminRepository.findByEmailAndActiveTrue(request.email());
        if (adminMatch.isPresent()) {
            return authenticateAdmin(adminMatch.get(), request.password());
        }

        // Same exception whether the email didn't exist or the password was wrong -
        // never let a client distinguish "no such user" from "wrong password".
        log.warn("Login attempt failed - no account found for email={}", request.email());
        throw new InvalidCredentialsException();
    }

    private LoginResponse authenticateVendor(Vendor vendor, String rawPassword) {
        if (!passwordEncoder.matches(rawPassword, vendor.getPasswordHash())) {
            log.warn("Login attempt failed - bad password for vendorId={}", vendor.getId());
            throw new InvalidCredentialsException();
        }

        if (vendor.getStatus() == Vendor.VendorStatus.SUSPENDED) {
            throw new IllegalStateException("This vendor account has been suspended");
        }

        String token = jwtService.generateToken(vendor.getId(), List.of("VENDOR"));
        log.info("Vendor logged in: id={}", vendor.getId());
        return new LoginResponse(token, "VENDOR", vendor.getId(), vendor.getBusinessName());
    }

    private LoginResponse authenticateAdmin(Admin admin, String rawPassword) {
        if (!passwordEncoder.matches(rawPassword, admin.getPasswordHash())) {
            log.warn("Login attempt failed - bad password for adminId={}", admin.getId());
            throw new InvalidCredentialsException();
        }

        String token = jwtService.generateToken(admin.getId(), List.of("ADMIN"));
        log.info("Admin logged in: id={}", admin.getId());
        return new LoginResponse(token, "ADMIN", admin.getId(), admin.getFullName());
    }
}
