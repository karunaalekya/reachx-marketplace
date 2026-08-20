package com.marketplace.shipping.client;

import com.fasterxml.jackson.databind.JsonNode;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.concurrent.locks.ReentrantLock;

@Component
@Slf4j
public class ShiprocketClient {

    private static final String BASE_URL = "https://apiv2.shiprocket.in/v1/external";

    private final RestClient restClient;
    private final String email;
    private final String password;

    // Guards token refresh so concurrent requests don't all trigger a login call at once.
    private final ReentrantLock tokenLock = new ReentrantLock();
    private volatile ShiprocketToken cachedToken;

    public ShiprocketClient(
            @Value("${shiprocket.email}") String email,
            @Value("${shiprocket.password}") String password) {
        this.email = email;
        this.password = password;
        this.restClient = RestClient.builder().baseUrl(BASE_URL).build();
    }

    private String getValidToken() {
        ShiprocketToken current = cachedToken;
        if (current != null && !current.isNearExpiry()) {
            return current.token;
        }

        tokenLock.lock();
        try {
            // Re-check after acquiring the lock - another thread may have already refreshed it.
            if (cachedToken != null && !cachedToken.isNearExpiry()) {
                return cachedToken.token;
            }

            log.info("Refreshing Shiprocket auth token");
            JsonNode response = restClient.post()
                    .uri("/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of("email", email, "password", password))
                    .retrieve()
                    .body(JsonNode.class);

            String token = response.get("token").asText();
            // Shiprocket tokens are valid 10 days - cache with that assumption.
            cachedToken = new ShiprocketToken(token, Instant.now().plus(10, ChronoUnit.DAYS));
            return token;
        } finally {
            tokenLock.unlock();
        }
    }

    public JsonNode createOrder(Map<String, Object> orderPayload) {
        return restClient.post()
                .uri("/orders/create/adhoc")
                .contentType(MediaType.APPLICATION_JSON)
                .headers(h -> h.setBearerAuth(getValidToken()))
                .body(orderPayload)
                .retrieve()
                .body(JsonNode.class);
    }

    public JsonNode trackByAwb(String awbNumber) {
        return restClient.get()
                .uri("/courier/track/awb/{awb}", awbNumber)
                .headers(h -> h.setBearerAuth(getValidToken()))
                .retrieve()
                .body(JsonNode.class);
    }
}
