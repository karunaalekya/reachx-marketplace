package com.marketplace.common.security;

import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .csrf(AbstractHttpConfigurer::disable)
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                    .requestMatchers("/api/v1/vendors/register").permitAll()
                    .requestMatchers("/api/v1/vendors/verify-email").permitAll()
                    .requestMatchers("/api/v1/auth/login").permitAll()
                    .requestMatchers("/api/v1/auth/forgot-password").permitAll()
                    .requestMatchers("/api/v1/auth/reset-password").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/products/**").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/orders").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/orders/**").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/payments/orders/*/initiate").permitAll()
                    .requestMatchers("/api/v1/payments/webhook/**").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/shipments/order/**").permitAll()
                    .requestMatchers("/api/v1/shipments/webhook/**").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.GET, "/api/v1/invoices/order/**").permitAll()
                    .requestMatchers(org.springframework.http.HttpMethod.POST, "/api/v1/disputes").permitAll()
                    .requestMatchers("/api/v1/payouts/webhook/**").permitAll()
                    .requestMatchers("/actuator/health").permitAll()
                    .anyRequest().authenticated()
            )
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    // Configurable via allowed-origins property - defaults to common local dev ports
    // (Vite, CRA) so a frontend session can hit this API out of the box locally. MUST be
    // set to the real deployed frontend origin(s) in production - "*" is never safe here
    // because credentials/Authorization headers are allowed below.
    @org.springframework.beans.factory.annotation.Value("${cors.allowed-origins:http://localhost:5173,http://localhost:3000}")
    private String allowedOrigins;

    @Bean
    public org.springframework.web.cors.CorsConfigurationSource corsConfigurationSource() {
        var config = new org.springframework.web.cors.CorsConfiguration();
        config.setAllowedOrigins(java.util.Arrays.asList(allowedOrigins.split(",")));
        config.setAllowedMethods(java.util.List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(java.util.List.of("Authorization", "Content-Type"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);

        var source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
