-- Extend order status to allow REFUNDED (previously only PENDING_PAYMENT/PAID/PAYMENT_FAILED/CANCELLED/FULFILLED)
ALTER TABLE orders DROP CONSTRAINT orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'FULFILLED', 'REFUNDED'));

-- Extend commission payout status to reflect "refunded, vendor is not owed this payout"
ALTER TABLE commission_records DROP CONSTRAINT commission_records_payout_status_check;
ALTER TABLE commission_records ADD CONSTRAINT commission_records_payout_status_check
    CHECK (payout_status IN ('PENDING', 'PAID_OUT', 'HELD_FOR_DISPUTE', 'CANCELLED_REFUNDED'));

CREATE TABLE refunds (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(id),
    payment_id          BIGINT NOT NULL REFERENCES payments(id),
    dispute_id          BIGINT REFERENCES disputes(id),
    gateway             VARCHAR(20) NOT NULL CHECK (gateway IN ('RAZORPAY', 'CASHFREE', 'PAYU')),
    gateway_refund_id   VARCHAR(100),
    amount              NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'INITIATED'
                            CHECK (status IN ('INITIATED', 'PROCESSED', 'FAILED')),
    failure_reason      VARCHAR(512),
    initiated_by_admin_id BIGINT REFERENCES admins(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refunds_order_id ON refunds(order_id);
CREATE INDEX idx_refunds_status ON refunds(status);
