-- Orders split by vendor at the line-item level (multi-vendor cart = one order, many vendor sub-totals)

CREATE TABLE orders (
    id                  BIGSERIAL PRIMARY KEY,
    order_number        VARCHAR(40) NOT NULL UNIQUE,   -- customer-facing, e.g. ORD-20260816-00001
    customer_email      VARCHAR(255) NOT NULL,
    customer_phone      VARCHAR(20) NOT NULL,
    shipping_address     TEXT NOT NULL,
    subtotal_amount     NUMERIC(12,2) NOT NULL CHECK (subtotal_amount >= 0),
    total_amount        NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
    status              VARCHAR(20) NOT NULL DEFAULT 'PENDING_PAYMENT'
                            CHECK (status IN ('PENDING_PAYMENT', 'PAID', 'PAYMENT_FAILED', 'CANCELLED', 'FULFILLED')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_customer_email ON orders(customer_email);

CREATE TABLE order_items (
    id              BIGSERIAL PRIMARY KEY,
    order_id        BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id      BIGINT NOT NULL REFERENCES products(id),
    vendor_id       BIGINT NOT NULL REFERENCES vendors(id),
    product_name    VARCHAR(255) NOT NULL,   -- snapshot at purchase time - product name can change later
    unit_price      NUMERIC(12,2) NOT NULL CHECK (unit_price >= 0),   -- snapshot - price can change later
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    line_total      NUMERIC(12,2) NOT NULL CHECK (line_total >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_vendor_id ON order_items(vendor_id);

-- Payments: one row per attempt, so retries after a failed payment don't overwrite history.
CREATE TABLE payments (
    id                      BIGSERIAL PRIMARY KEY,
    order_id                BIGINT NOT NULL REFERENCES orders(id),
    gateway                 VARCHAR(20) NOT NULL CHECK (gateway IN ('RAZORPAY', 'CASHFREE', 'PAYU')),
    gateway_order_id        VARCHAR(100) NOT NULL,
    gateway_payment_id      VARCHAR(100),
    amount                  NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    currency                VARCHAR(3) NOT NULL DEFAULT 'INR',
    status                  VARCHAR(20) NOT NULL DEFAULT 'CREATED'
                                CHECK (status IN ('CREATED', 'SUCCESS', 'FAILED')),
    -- Idempotency: Razorpay/webhooks can fire more than once for the same event.
    -- This constraint makes a duplicate webhook a no-op at the DB level, not just app logic.
    webhook_event_id        VARCHAR(150) UNIQUE,
    failure_reason          VARCHAR(512),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order_id ON payments(order_id);
CREATE INDEX idx_payments_gateway_order_id ON payments(gateway_order_id);
CREATE UNIQUE INDEX idx_payments_gateway_payment_id ON payments(gateway_payment_id) WHERE gateway_payment_id IS NOT NULL;
