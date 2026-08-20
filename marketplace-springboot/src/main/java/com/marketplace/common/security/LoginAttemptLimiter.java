package com.marketplace.common.security;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

// Simple fixed-window counter in Redis: 5 failed attempts per email locks that email
// out for 15 minutes. Redis TTL does the expiry for free - no cleanup job needed.
@Component
@RequiredArgsConstructor
public class LoginAttemptLimiter {

    private static final int MAX_ATTEMPTS = 5;
    private static final Duration LOCKOUT_WINDOW = Duration.ofMinutes(15);
    private static final String KEY_PREFIX = "login-attempts:";

    private final StringRedisTemplate redisTemplate;

    public boolean isLocked(String email) {
        String value = redisTemplate.opsForValue().get(KEY_PREFIX + email);
        if (value == null) return false;
        return Integer.parseInt(value) >= MAX_ATTEMPTS;
    }

    public void recordFailure(String email) {
        String key = KEY_PREFIX + email;
        Long attempts = redisTemplate.opsForValue().increment(key);
        if (attempts != null && attempts == 1L) {
            // Only set TTL on the first failure - subsequent increments must not reset the clock,
            // or a determined attacker could keep the window open indefinitely by retrying fast.
            redisTemplate.expire(key, LOCKOUT_WINDOW);
        }
    }

    public void clearOnSuccess(String email) {
        redisTemplate.delete(KEY_PREFIX + email);
    }
}
