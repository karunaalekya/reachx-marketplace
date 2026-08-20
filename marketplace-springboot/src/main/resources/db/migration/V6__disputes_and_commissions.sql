CREATE TABLE disputes (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(id),
    vendor_id           BIGINT NOT NULL REFERENCES vendors(id),
    raised_by_email     VARCHAR(255) NOT NULL,
    category            VARCHAR(30) NOT NULL
                            CHECK (category IN ('ITEM_NOT_RECEIVED', 'ITEM_DAMAGED', 'ITEM_NOT_AS_DESCRIBED',
                                                 'WRONG_ITEM', 'REFUND_REQUEST', 'OTHER')),
    description         TEXT NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'OPEN'
                            CHECK (status IN ('OPEN', 'UNDER_REVIEW', 'RESOLVED_REFUNDED',
                                               'RESOLVED_REJECTED', 'RESOLVED_REPLACED')),
    resolution_notes    TEXT,
    resolved_by_admin_id BIGINT REFERENCES admins(id),
    resolved_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_disputes_order_id ON disputes(order_id);
CREATE INDEX idx_disputes_vendor_id ON disputes(vendor_id);
CREATE INDEX idx_disputes_status ON disputes(status);

-- Commission ledger: one row per PAID order-vendor split, computed at commission_rate
-- effective at the time of the order (vendor's rate can change later without rewriting history).
CREATE TABLE commission_records (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(id),
    vendor_id           BIGINT NOT NULL REFERENCES vendors(id),
    gross_amount        NUMERIC(12,2) NOT NULL CHECK (gross_amount >= 0),
    commission_rate     NUMERIC(5,2) NOT NULL,
    commission_amount   NUMERIC(12,2) NOT NULL CHECK (commission_amount >= 0),
    vendor_payout_amount NUMERIC(12,2) NOT NULL CHECK (vendor_payout_amount >= 0),
    payout_status       VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                            CHECK (payout_status IN ('PENDING', 'PAID_OUT', 'HELD_FOR_DISPUTE')),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_vendor_commission UNIQUE (order_id, vendor_id)
);

CREATE INDEX idx_commission_vendor_id ON commission_records(vendor_id);
CREATE INDEX idx_commission_payout_status ON commission_records(payout_status);
