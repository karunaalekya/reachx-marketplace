-- Indian GST law requires each seller (vendor, here - not the platform) to issue invoices with
-- an unbroken sequential number per financial year. A simple "COUNT(*) + 1" is not safe under
-- concurrent invoice generation (two shipments for the same vendor created in the same instant
-- could read the same count and collide). This table backs an atomic INSERT ... ON CONFLICT ...
-- DO UPDATE ... RETURNING allocation instead - see InvoiceNumberGenerator.
CREATE TABLE invoice_sequences (
    vendor_id       BIGINT NOT NULL REFERENCES vendors(id),
    financial_year  VARCHAR(7) NOT NULL,   -- e.g. '2026-27' (Indian FY: Apr 1 - Mar 31)
    last_number     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (vendor_id, financial_year)
);

-- One invoice per vendor per order, matching shipment granularity (each vendor in a multi-vendor
-- order ships and is invoiced independently - see Shipment's own (order_id, vendor_id) uniqueness).
CREATE TABLE invoices (
    id                  BIGSERIAL PRIMARY KEY,
    invoice_number      VARCHAR(64) NOT NULL UNIQUE,
    order_id            BIGINT NOT NULL REFERENCES orders(id),
    vendor_id           BIGINT NOT NULL REFERENCES vendors(id),
    shipment_id         BIGINT NOT NULL REFERENCES shipments(id),
    financial_year      VARCHAR(7) NOT NULL,
    sequence_number     INTEGER NOT NULL,
    vendor_state         VARCHAR(64),   -- snapshotted at generation time - vendor's own state can change later, invoice must not
    customer_state        VARCHAR(64),  -- snapshotted from the order for the same reason
    tax_type            VARCHAR(16) NOT NULL,   -- CGST_SGST or IGST
    tax_rate_percent    NUMERIC(5,2) NOT NULL,  -- flat rate, see InvoiceService comment on why this isn't per-HSN-code
    taxable_value       NUMERIC(12,2) NOT NULL,
    cgst_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    sgst_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    igst_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount        NUMERIC(12,2) NOT NULL,
    pdf_url             VARCHAR(1024) NOT NULL,
    storage_key         VARCHAR(512) NOT NULL,
    generated_at        TIMESTAMPTZ NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_invoice_order_vendor UNIQUE (order_id, vendor_id)
);

CREATE INDEX idx_invoices_vendor_id ON invoices(vendor_id);
CREATE INDEX idx_invoices_order_id ON invoices(order_id);
