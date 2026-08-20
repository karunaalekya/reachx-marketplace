package com.marketplace.common.exception;

// Deliberately generic - never reveals whether the email or the password was wrong.
public class InvalidCredentialsException extends RuntimeException {
    public InvalidCredentialsException() {
        super("Invalid email or password");
    }
}
