-- GST invoicing (locked decision in PROJECT_STATE.md) requires knowing the customer's state to
-- determine CGST+SGST (intra-state) vs IGST (inter-state) - the order previously only stored a
-- free-text shipping address with no structured state, so there was nothing to compare against
-- the vendor's state. Nullable because existing orders predate this column and can't be
-- backfilled from free-text address reliably; new checkouts must supply it (enforced in
-- CreateOrderRequest, not at the DB level, to avoid breaking existing rows).
ALTER TABLE orders ADD COLUMN customer_state VARCHAR(64);
