package com.marketplace.config;

import com.marketplace.common.security.CurrentVendorArgumentResolver;
import com.marketplace.common.security.RateLimitInterceptor;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.List;

@Configuration
@RequiredArgsConstructor
public class WebConfig implements WebMvcConfigurer {

    private final RateLimitInterceptor rateLimitInterceptor;

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new CurrentVendorArgumentResolver());
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // RateLimitInterceptor itself decides which specific paths it actually limits -
        // registered broadly here, filtered internally, so adding a new limited path later
        // is a one-line change in the interceptor, not a routing change here too.
        registry.addInterceptor(rateLimitInterceptor);
    }
}
