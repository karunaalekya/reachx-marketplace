package com.marketplace.common.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.Duration;
import java.time.Instant;
import java.util.Map;

// Applies a per-IP request limit to specific public endpoints prone to abuse (registration
// spam, dispute spam, password-reset email flooding). Deliberately NOT applied globally -
// authenticated endpoints are already protected by requiring a valid JWT, and blanket rate
// limiting every route adds latency/complexity without much additional protection there.
@Component
@RequiredArgsConstructor
public class RateLimitInterceptor implements HandlerInterceptor {

    private final RateLimiter rateLimiter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // path prefix -> (max requests, window). Deliberately simple/explicit rather than a config
    // file - these are security-relevant limits, not typical externalized tuning knobs, and
    // should require a code change (and review) to loosen.
    private static final Map<String, Limit> LIMITS = Map.of(
            "/api/v1/vendors/register", new Limit(5, Duration.ofHours(1)),
            "/api/v1/disputes", new Limit(10, Duration.ofHours(1)),
            "/api/v1/orders", new Limit(30, Duration.ofMinutes(10)),
            "/api/v1/auth/forgot-password", new Limit(5, Duration.ofHours(1))
    );

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String path = request.getRequestURI();
        Limit limit = LIMITS.get(path);
        if (limit == null) {
            return true;   // not a rate-limited path, proceed normally
        }

        // NOTE: uses the direct connection IP. If this API sits behind a reverse proxy/load
        // balancer in production, this will see the proxy's IP for every request, not the real
        // client - X-Forwarded-For handling needs to be added at deploy time once the actual
        // proxy setup is known, rather than guessed at here.
        String clientIp = request.getRemoteAddr();
        String key = path + ":" + clientIp;

        boolean allowed = rateLimiter.tryAcquire(key, limit.maxRequests(), limit.window());
        if (!allowed) {
            response.setStatus(429);
            response.setContentType("application/json");
            response.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "timestamp", Instant.now().toString(),
                    "status", 429,
                    "error", "Too many requests - please try again later"
            )));
            return false;
        }
        return true;
    }

    private record Limit(int maxRequests, Duration window) {}
}
