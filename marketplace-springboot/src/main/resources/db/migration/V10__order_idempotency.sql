-- A client-supplied idempotency key prevents a network retry or double-click on checkout
-- from creating two orders (and double-decrementing stock) for the same cart submission.
ALTER TABLE orders ADD COLUMN idempotency_key VARCHAR(100);
CREATE UNIQUE INDEX idx_orders_idempotency_key ON orders(idempotency_key) WHERE idempotency_key IS NOT NULL;
