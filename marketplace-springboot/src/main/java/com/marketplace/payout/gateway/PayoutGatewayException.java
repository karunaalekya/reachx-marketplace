package com.marketplace.payout.gateway;

public class PayoutGatewayException extends RuntimeException {
    public PayoutGatewayException(String message, Throwable cause) {
        super(message, cause);
    }

    public PayoutGatewayException(String message) {
        super(message);
    }
}
