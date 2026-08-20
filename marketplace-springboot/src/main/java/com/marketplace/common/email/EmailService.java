package com.marketplace.common.email;

public interface EmailService {
    void send(String toEmail, String subject, String body);
}
