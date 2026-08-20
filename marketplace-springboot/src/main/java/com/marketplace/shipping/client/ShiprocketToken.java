package com.marketplace.shipping.client;

import java.time.Instant;

// Shiprocket issues a bearer token valid ~10 days on login - re-authenticating on every
// API call would be both slow and needlessly hammer their auth endpoint. This holder lets
// the client reuse a token until it's close to expiry.
class ShiprocketToken {
    final String token;
    final Instant expiresAt;

    ShiprocketToken(String token, Instant expiresAt) {
        this.token = token;
        this.expiresAt = expiresAt;
    }

    boolean isNearExpiry() {
        // Refresh 1 hour before actual expiry, not at the exact instant - avoids a request
        // failing mid-flight because the token expired between the check and the call.
        return Instant.now().isAfter(expiresAt.minusSeconds(3600));
    }
}
