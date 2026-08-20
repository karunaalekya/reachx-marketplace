package com.marketplace.auth.dto;

public record LoginResponse(
        String token,
        String role,
        Long userId,
        String displayName
) {}
