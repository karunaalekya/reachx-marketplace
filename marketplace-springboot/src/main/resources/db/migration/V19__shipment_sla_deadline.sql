-- Ship-by SLA deadline - real seller platforms (Flipkart/Amazon) show a "ship by" countdown so
-- sellers know when they're at risk of penalty. This didn't exist anywhere in the schema before.
--
-- Rule: deadline = shipment creation time + a fixed SLA window (see shiprocket.sla-hours in
-- application.yml, default 48h). Computed once at creation and stored, not recalculated on
-- read, so a shipment created under a 48h SLA keeps that deadline even if the config later
-- changes to 24h.
ALTER TABLE shipments ADD COLUMN ship_by_deadline TIMESTAMPTZ;

-- Best-effort backfill for shipments already in flight: deadline computed retroactively from
-- their actual created_at using today's default SLA. Accepted as a one-time backfill for
-- pre-launch data, matching V18's precedent.
UPDATE shipments SET ship_by_deadline = created_at + INTERVAL '48 hours' WHERE ship_by_deadline IS NULL;
