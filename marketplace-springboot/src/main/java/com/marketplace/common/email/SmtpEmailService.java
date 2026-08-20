package com.marketplace.common.email;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
@Slf4j
public class SmtpEmailService implements EmailService {

    private final JavaMailSender mailSender;

    @Value("${mail.from:no-reply@marketplace.local}")
    private String fromAddress;

    @Override
    public void send(String toEmail, String subject, String body) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromAddress);
            message.setTo(toEmail);
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            log.info("Email sent: to={} subject={}", toEmail, subject);
        } catch (Exception e) {
            // Deliberately does NOT rethrow: a failed password-reset email shouldn't 500 the
            // whole request and leak whether an account exists (see PasswordResetService for
            // why the response is identical either way). The real production gap this leaves:
            // if SMTP is misconfigured, resets/verifications silently fail to deliver with only
            // a log line - worth wiring up an alert on this log pattern before real launch.
            log.error("Failed to send email: to={} subject={}", toEmail, subject, e);
        }
    }
}
