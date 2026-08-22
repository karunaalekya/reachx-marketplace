-- Fixes a real gap: refunds had no vendor_id, and RefundService.initiateRefund()'s idempotency
-- check (findByOrderId) treats "a refund exists for this order" as "this vendor's refund is
-- done" - in a multi-vendor order, a second vendor's dispute-triggered refund on the same order
-- was silently skipped because the first vendor's refund row already satisfied that check.
--
-- Backfill: existing refund rows predate per-vendor refunds entirely (this bug meant only ever
-- one refund per order could exist), so each existing row's vendor_id is derived from its own
-- order - the single vendor whose items make up that order, when the order has exactly one
-- vendor. An order with multiple vendors and a pre-existing refund row cannot be backfilled
-- correctly from data alone (the row doesn't record which vendor it was actually paid out to) -
-- flagged as NULL for manual reconciliation rather than guessed.
ALTER TABLE refunds ADD COLUMN vendor_id BIGINT REFERENCES vendors(id);

UPDATE refunds r
SET vendor_id = sub.only_vendor_id
FROM (
    SELECT oi.order_id, MIN(oi.vendor_id) AS only_vendor_id
    FROM order_items oi
    GROUP BY oi.order_id
    HAVING COUNT(DISTINCT oi.vendor_id) = 1
) sub
WHERE r.order_id = sub.order_id;

-- NOT NULL only after backfill - a multi-vendor order's pre-existing refund row (if any) is left
-- NULL above rather than guessed, so this constraint is deliberately deferred; enforce it once
-- any such rows are manually reconciled. Uncomment when ready:
-- ALTER TABLE refunds ALTER COLUMN vendor_id SET NOT NULL;

-- The actual fix: idempotency must be scoped per vendor, not per order, so a second vendor's
-- refund in the same multi-vendor order is never blocked by the first vendor's row.
CREATE UNIQUE INDEX uq_refunds_order_vendor ON refunds(order_id, vendor_id);

CREATE INDEX idx_refunds_vendor_id ON refunds(vendor_id);
