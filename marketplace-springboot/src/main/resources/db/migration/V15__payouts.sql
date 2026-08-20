-- Payout ledger: one row per commission_record that has been (or was attempted to be) paid
-- out to a vendor. One-per-commission-record is enforced at the DB level (uq_payout_commission
-- below), same granularity reasoning as invoices being one-per-(order,vendor): a commission
-- record represents exactly one vendor's earnings on exactly one order, and must be paid out
-- at most once.
--
-- Unlike shipment/invoice/commission generation (which are safe to blindly retry via Kafka's
-- 3x-then-DLT error handler), a payout MOVES REAL MONEY - a naive retry after a transfer that
-- actually succeeded but failed on a later step (e.g. saving the response) would double-pay a
-- vendor. So PayoutService deliberately does NOT rethrow on gateway failure the way
-- ShippingService/CommissionService/InvoiceService do - see PayoutService for the reasoning.
-- This table is the single source of truth for "has this vendor already been paid for this
-- commission record", checked before ever calling a payout gateway.
CREATE TABLE payouts (
    id                      BIGSERIAL PRIMARY KEY,
    commission_record_id    BIGINT NOT NULL REFERENCES commission_records(id),
    order_id                BIGINT NOT NULL REFERENCES orders(id),
    vendor_id               BIGINT NOT NULL REFERENCES vendors(id),
    vendor_payout_account_id BIGINT REFERENCES vendor_payout_accounts(id),
    amount                  NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    gateway                 VARCHAR(20) NOT NULL CHECK (gateway IN ('CASHFREE', 'RAZORPAYX')),
    gateway_transfer_id     VARCHAR(255),
    idempotency_key         VARCHAR(100) NOT NULL UNIQUE,
    status                  VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                                CHECK (status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'BLOCKED')),
    -- BLOCKED = never attempted against the gateway at all (e.g. vendor has no verified payout
    -- account yet) - distinct from FAILED, which means the gateway was actually called and
    -- rejected/errored. Ops needs to know which of those two happened for the right fix.
    failure_reason          TEXT,
    initiated_at            TIMESTAMPTZ,
    completed_at            TIMESTAMPTZ,
    retry_count             INTEGER NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_payout_commission UNIQUE (commission_record_id)
);

CREATE INDEX idx_payouts_vendor_id ON payouts(vendor_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_order_id ON payouts(order_id);
