package com.marketplace.payment.dto;

import java.math.BigDecimal;

// Shape differs by gateway: Razorpay/Cashfree need gatewayReference for their JS widget;
// PayU needs rawGatewayResponse (the full signed form field set) since it has no JS widget -
// the frontend must render/submit an actual HTML form with those exact fields.
public record InitiatePaymentResponse(
        String gateway,
        String gatewayReference,
        BigDecimal amount,
        String currency,
        String rawGatewayResponse
) {}
