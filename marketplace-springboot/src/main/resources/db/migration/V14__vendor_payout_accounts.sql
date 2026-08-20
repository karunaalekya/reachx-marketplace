-- Vendor bank/beneficiary details for automated payouts (Cashfree Payouts / RazorpayX - see
-- PROJECT_STATE.md locked decision). Deliberately a separate table from `vendors`, same
-- reasoning as `admins` being separate from `vendors`: banking credentials are sensitive enough
-- to warrant their own access surface, and a vendor may change banks over time - history should
-- be kept (old rows deactivated, not overwritten), not just replaced in place.
--
-- account_number is stored ENCRYPTED at the application layer (AES/GCM, see
-- common/security/AesGcmStringConverter.java) - the raw account number never lands in this
-- column in plaintext. account_number_last4 is stored separately, in plaintext, purely for
-- vendor-facing display ("Account ending 4321") without ever decrypting the real number for
-- that purpose. The AES key itself comes from an env var (payout.encryption-key) - this is a
-- real, documented simplification: production-grade key management should move this to a
-- proper KMS/HSM (AWS KMS, GCP KMS, HashiCorp Vault) rather than a static env var, so the key
-- itself isn't just sitting in application config. Flagged here, not hidden.
CREATE TABLE vendor_payout_accounts (
    id                      BIGSERIAL PRIMARY KEY,
    vendor_id               BIGINT NOT NULL REFERENCES vendors(id),
    account_holder_name     VARCHAR(255) NOT NULL,
    account_number          VARCHAR(512) NOT NULL,   -- AES/GCM ciphertext, base64 - not raw digits
    account_number_last4    VARCHAR(4) NOT NULL,
    ifsc_code               VARCHAR(11) NOT NULL,
    bank_name               VARCHAR(255),
    account_type            VARCHAR(10) NOT NULL CHECK (account_type IN ('SAVINGS', 'CURRENT')),
    vpa                     VARCHAR(255),             -- optional UPI VPA, used by RazorpayX fund accounts
    gateway                 VARCHAR(20) NOT NULL CHECK (gateway IN ('CASHFREE', 'RAZORPAYX')),
    beneficiary_id          VARCHAR(255),             -- the gateway's own id for this beneficiary/fund account
    beneficiary_status      VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                                CHECK (beneficiary_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    rejection_reason        TEXT,
    is_active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendor_payout_accounts_vendor_id ON vendor_payout_accounts(vendor_id);

-- Only one ACTIVE account per vendor at a time - submitting new bank details deactivates the
-- old row (kept for audit history) rather than overwriting it in place. A partial unique index
-- (not a plain UNIQUE column) so historical inactive rows for the same vendor are allowed.
CREATE UNIQUE INDEX uq_vendor_payout_accounts_active_vendor
    ON vendor_payout_accounts(vendor_id) WHERE is_active = TRUE;
