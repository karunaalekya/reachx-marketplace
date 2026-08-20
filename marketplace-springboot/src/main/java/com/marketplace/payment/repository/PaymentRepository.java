package com.marketplace.payment.repository;

import com.marketplace.payment.model.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface PaymentRepository extends JpaRepository<Payment, Long> {
    Optional<Payment> findByGatewayOrderId(String gatewayOrderId);
    boolean existsByWebhookEventId(String webhookEventId);
    Optional<Payment> findFirstByOrderIdAndStatusOrderByCreatedAtDesc(Long orderId, Payment.PaymentStatus status);
}
