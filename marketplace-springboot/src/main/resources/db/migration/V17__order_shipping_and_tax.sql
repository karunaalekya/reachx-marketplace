-- Closes the last open 🔴 gap in ROADMAP.md: "No shipping cost or tax in order total".
-- OrderService previously set totalAmount = subtotalAmount (sum of item lineTotals) with a
-- deliberate comment flagging shipping/tax as a follow-up, not a silent zero forever - this is
-- that follow-up.
--
-- shipping_fee_amount and tax_amount are both DEFAULT 0 (not nullable) so every pre-existing
-- order reads as "no shipping charged, no tax broken out" rather than NULL - consistent with
-- subtotal_amount/total_amount already being NOT NULL on this table (V3).
--
-- tax_amount is informational/display only here, not a new pricing decision: this system already
-- treats product prices as GST-inclusive (see InvoiceService.buildInvoice's documented
-- extraction approach), and the new shipping fee follows the same convention rather than being
-- taxed on top - see ShippingCostCalculator / OrderService for the extraction logic that fills
-- this column at checkout time.
-- CHECK (... >= 0) on every money column is an established pattern in this schema (see e.g.
-- V3's subtotal_amount/total_amount/line_total, V6's commission columns, V16's tcs/tds columns) -
-- this migration originally missed it on both new columns; added here to match.
ALTER TABLE orders ADD COLUMN shipping_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_amount >= 0);
ALTER TABLE orders ADD COLUMN tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0);

-- Shipping is computed and charged per vendor (each vendor in a multi-vendor order ships
-- independently - same granularity as shipments/invoices, see Shipment's own (order_id,
-- vendor_id) uniqueness), then summed into orders.shipping_fee_amount above. This table is the
-- per-vendor breakdown backing that sum, so InvoiceService can later add each vendor's own
-- shipping charge into that vendor's taxable value instead of only ever seeing the order-level
-- total. Snapshotted at order-creation time and never recalculated - if config rates change
-- later, past orders must keep showing what was actually charged.
CREATE TABLE order_vendor_shipping_charges (
    id                    BIGSERIAL PRIMARY KEY,
    order_id              BIGINT NOT NULL REFERENCES orders(id),
    vendor_id             BIGINT NOT NULL REFERENCES vendors(id),
    shipping_fee_amount   NUMERIC(12,2) NOT NULL CHECK (shipping_fee_amount >= 0),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_order_vendor_shipping_charge UNIQUE (order_id, vendor_id)
);

CREATE INDEX idx_order_vendor_shipping_charges_order_id ON order_vendor_shipping_charges(order_id);

-- InvoiceService previously computed each vendor's taxable value/total purely from that vendor's
-- order_items, which excluded shipping entirely (there was none to exclude before this
-- migration). Now that a vendor can be charged shipping too, their invoice must reflect it -
-- otherwise the invoice total would permanently understate what that vendor actually collected
-- once shipping charges exist. DEFAULT 0 so every invoice issued before this migration continues
-- to read exactly as it always has.
ALTER TABLE invoices ADD COLUMN shipping_fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (shipping_fee_amount >= 0);
