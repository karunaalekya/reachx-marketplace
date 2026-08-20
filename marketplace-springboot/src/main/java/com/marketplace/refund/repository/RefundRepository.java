package com.marketplace.refund.repository;

import com.marketplace.refund.model.Refund;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;

public interface RefundRepository extends JpaRepository<Refund, Long> {
    Optional<Refund> findByOrderId(Long orderId);
}
