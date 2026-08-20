-- Unified reset-token table for both vendors and admins (discriminator column instead of
-- two near-identical tables) - password reset is the same mechanism regardless of user type.
CREATE TABLE password_reset_tokens (
    id              BIGSERIAL PRIMARY KEY,
    user_type       VARCHAR(10) NOT NULL CHECK (user_type IN ('VENDOR', 'ADMIN')),
    user_id         BIGINT NOT NULL,
    token_hash      VARCHAR(255) NOT NULL UNIQUE,   -- SHA-256 of the token, never store the raw token
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_reset_tokens_user ON password_reset_tokens(user_type, user_id);
CREATE INDEX idx_reset_tokens_expires ON password_reset_tokens(expires_at);

-- Email verification for vendors (admins are provisioned directly by ops, not self-registered,
-- so verification doesn't apply to them the same way).
ALTER TABLE vendors
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN verification_token_hash VARCHAR(255);

CREATE UNIQUE INDEX idx_vendors_verification_token ON vendors(verification_token_hash)
    WHERE verification_token_hash IS NOT NULL;
