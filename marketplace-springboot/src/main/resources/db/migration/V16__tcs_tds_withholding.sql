-- TCS (Sec 52, CGST Act - e-commerce operator collects 1% on net taxable supply value) and
-- TDS (Sec 194-O, Income Tax Act - e-commerce operator deducts 1% of gross sale value) are both
-- statutory obligations on THIS platform (the operator), separate from the GST a vendor charges
-- on their own invoice (already built in V13/InvoiceService). Neither existed anywhere in this
-- codebase before this migration - flagged in ROADMAP.md as a 🔴 critical gap and closed here.

-- Fix found while building this: CommissionRecord.PayoutStatus already has CANCELLED_REFUNDED
-- in the Java enum (RefundService actively sets it), but V6's CHECK constraint never included
-- it - meaning a refund on a payout-status-checked commission record could only have worked
-- because Postgres was never actually asked to validate that value before now, or would have
-- thrown on save. Widening the constraint to match the enum that's been shipping since V6.
ALTER TABLE commission_records DROP CONSTRAINT commission_records_payout_status_check;
ALTER TABLE commission_records ADD CONSTRAINT commission_records_payout_status_check
    CHECK (payout_status IN ('PENDING', 'PAID_OUT', 'HELD_FOR_DISPUTE', 'CANCELLED_REFUNDED'));

-- tcs_amount: 1% of gross_amount (Sec 52 CGST Act), split CGST+SGST 0.5/0.5 for intra-state or
--   IGST 1% for inter-state - same customerState-vs-vendor.state comparison InvoiceService
--   already does for output GST, reused here rather than re-derived.
-- tds_amount: 1% of gross_amount (Sec 194-O Income Tax Act) if vendor has a PAN on file, 5%
--   (Sec 206AA - the standard no-PAN penalty rate) if not. Threshold note: Sec 194-O actually
--   only applies once a vendor's *annual* gross sales through this operator cross ₹5,00,000 in
--   a financial year - but this schema has no per-vendor-per-FY running-total lookup built yet,
--   and Sec 52 TCS has NO threshold at all (applies from rupee one). Simplification taken here,
--   same posture as InvoiceService's flat-18%-GST decision: deduct TDS on every commission
--   record unconditionally rather than silently under-withholding for vendors near the
--   threshold. Over-withholding is a vendor reclaiming excess credit at ITR filing time (annoying,
--   recoverable); under-withholding is the OPERATOR facing interest + penalty under the Act
--   (not recoverable after the fact). Revisit once vendors have a per-FY running-total field.
-- vendor_net_payable: gross_amount - commission_amount - tcs_amount - tds_amount. This, not
--   vendor_payout_amount, is what PayoutService actually transfers - vendor_payout_amount is
--   kept as-is (commission-only deduction) so existing pre-V16 records and any report that
--   already reads it are unaffected; the new field is additive.
ALTER TABLE commission_records
    ADD COLUMN tcs_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tcs_amount >= 0),
    ADD COLUMN tds_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tds_amount >= 0),
    ADD COLUMN vendor_net_payable NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (vendor_net_payable >= 0);

-- Filing/reporting ledger - one row per commission_record, capturing exactly what was withheld
-- and why (tax_type distinguishes TCS from TDS since they're filed on completely separate
-- government forms/schedules: TCS -> monthly GSTR-8, TDS -> quarterly Form 26Q/27EQ). Kept as
-- its own table rather than just reading commission_records columns because a real filing needs
-- an immutable snapshot (place-of-supply type, rate applied, PAN-on-file-at-the-time) that must
-- NOT change even if the vendor's state or PAN is edited after the fact - commission_records
-- itself has no such history-preservation guarantee for those source fields.
CREATE TABLE tax_withholding_records (
    id                      BIGSERIAL PRIMARY KEY,
    commission_record_id    BIGINT NOT NULL REFERENCES commission_records(id),
    order_id                BIGINT NOT NULL REFERENCES orders(id),
    vendor_id               BIGINT NOT NULL REFERENCES vendors(id),
    tax_type                VARCHAR(10) NOT NULL CHECK (tax_type IN ('TCS', 'TDS')),
    supply_type             VARCHAR(20) CHECK (supply_type IN ('INTRA_STATE', 'INTER_STATE')),
    -- NULL supply_type for TDS rows - place-of-supply only matters for TCS's CGST+SGST-vs-IGST
    -- split; TDS under the Income Tax Act has no such split.
    rate_percent            NUMERIC(5,2) NOT NULL,
    taxable_value           NUMERIC(12,2) NOT NULL CHECK (taxable_value >= 0),
    amount                  NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
    vendor_pan_on_file      VARCHAR(10),
    -- Snapshotted, not FK-read-live, for the reason in the table comment above.
    financial_year          VARCHAR(7) NOT NULL,   -- e.g. '2026-27', matches InvoiceService's FY convention
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_withholding_commission_type UNIQUE (commission_record_id, tax_type)
);

CREATE INDEX idx_tax_withholding_vendor_id ON tax_withholding_records(vendor_id);
CREATE INDEX idx_tax_withholding_fy_type ON tax_withholding_records(financial_year, tax_type);
