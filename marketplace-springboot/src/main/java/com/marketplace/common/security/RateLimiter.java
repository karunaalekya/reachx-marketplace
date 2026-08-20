package com.marketplace.common.security;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;

// Generic fixed-window rate limiter, keyed however the caller wants (IP, IP+path, email, etc).
// LoginAttemptLimiter stays separate since its semantics differ (attempts-until-locked, not
// requests-per-window, and it distinguishes failure vs success) - this is for simpler
// "N requests per window" limits on public endpoints prone to abuse/spam.
@Component
@RequiredArgsConstructor
public class RateLimiter {

    private final StringRedisTemplate redisTemplate;
    private static final String KEY_PREFIX = "rate-limit:";

    // Returns true if the request should be ALLOWED, false if the limit has been exceeded.
    public boolean tryAcquire(String key, int maxRequests, Duration window) {
        String redisKey = KEY_PREFIX + key;
        Long count = redisTemplate.opsForValue().increment(redisKey);
        if (count != null && count == 1L) {
            redisTemplate.expire(redisKey, window);
        }
        return count == null || count <= maxRequests;
    }
}
