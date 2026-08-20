-- Replaces the single-document KYC model (vendors.kyc_document_url / rejection_reason, one
-- status for the whole vendor) with a real per-document-type model. This was flagged as a known
-- simplification when the presign/confirm upload endpoints were first added (V-none, prior
-- session) - the frontend's own mock data assumed separate PAN / GSTIN / bank-cheque documents
-- each independently tracked and reviewable, which the single-field model could never actually
-- represent. This migration is the deliberate follow-up, not a silent bolt-on.
--
-- One row per (vendor, doc_type) - a vendor re-uploading the same doc_type overwrites that row's
-- storage_key/document_url and resets it to PENDING, rather than accumulating history. UNIQUE
-- constraint enforces this at the DB level, matching the "one canonical live document per slot"
-- model VendorService already reasons about for the single-document case (V-none: reset-on-
-- reupload). Full document-review history is out of scope here (would need an append-only audit
-- table) - flagged as a real gap, not built.
CREATE TABLE vendor_kyc_documents (
    id                BIGSERIAL PRIMARY KEY,
    vendor_id         BIGINT NOT NULL REFERENCES vendors(id),
    doc_type          VARCHAR(32) NOT NULL,
    storage_key       VARCHAR(512) NOT NULL,
    document_url      VARCHAR(1024) NOT NULL,
    status            VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    rejection_reason  TEXT,
    uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    decided_at        TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_vendor_kyc_documents_vendor_doctype UNIQUE (vendor_id, doc_type),
    CONSTRAINT chk_vendor_kyc_documents_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    -- Keeps doc_type honest against VendorKycDocument.DocType at the DB level too - same
    -- discipline as V11's product-image-count trigger, so a direct DB write or a stale second
    -- app instance can't insert a type the application no longer knows about. Extending the enum
    -- means extending this constraint in the same migration, not just the Java code (see
    -- VendorKycDocument.DocType javadoc for the required-count implication of adding a type).
    CONSTRAINT chk_vendor_kyc_documents_doctype CHECK (doc_type IN ('PAN', 'GSTIN', 'BANK_CHEQUE', 'MSME_CERTIFICATE'))
);

CREATE INDEX idx_vendor_kyc_documents_vendor_id ON vendor_kyc_documents(vendor_id);

-- Best-effort backfill: a vendor who already had a single kyc_document_url under the old model
-- gets it carried forward as a PAN-type row (arbitrary but deterministic choice - PAN is always
-- required and was the primary document in practice) so existing submissions aren't silently
-- discarded. storage_key is reconstructed as best-effort from document_url's path suffix, since
-- the old model never stored the key separately - this is lossy for any URL shape that doesn't
-- end in the object key (e.g. a signed/query-string CDN URL), which is a known, accepted
-- limitation of this one-time backfill, not something worth a data-repair script for a
-- pre-launch project with no real production rows yet.
INSERT INTO vendor_kyc_documents (vendor_id, doc_type, storage_key, document_url, status, rejection_reason, uploaded_at)
SELECT
    id,
    'PAN',
    regexp_replace(kyc_document_url, '^.*(vendor-kyc/.*)$', '\1'),
    kyc_document_url,
    kyc_status::text,
    rejection_reason,
    updated_at
FROM vendors
WHERE kyc_document_url IS NOT NULL;

-- vendors.kyc_status stays - it now holds the *derived/overall* status (recomputed by
-- VendorService whenever any document's decision changes), not a directly admin-set field
-- anymore. vendors.kyc_document_url and vendors.rejection_reason are dropped: with per-document
-- URLs and rejection reasons now living in vendor_kyc_documents, these two columns would be
-- stale/unwritten dead fields going forward - exactly the kind of drifted, nobody-updates-it
-- column this codebase's own history (drifted badge hex values, etc.) has already shown to be a
-- real risk, not a hypothetical one.
ALTER TABLE vendors DROP COLUMN kyc_document_url;
ALTER TABLE vendors DROP COLUMN rejection_reason;
