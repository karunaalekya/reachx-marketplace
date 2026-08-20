-- Admins are provisioned directly (seeded/inserted by ops), never self-registered via public API.
-- Kept separate from vendors so a compromised vendor account can never escalate to admin.

CREATE TABLE admins (
    id              BIGSERIAL PRIMARY KEY,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    full_name       VARCHAR(255) NOT NULL,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Bootstrap admin — CHANGE THIS PASSWORD IMMEDIATELY after first deploy.
-- Password hash below corresponds to plaintext "ChangeMeNow123!" (BCrypt, cost 10).
-- Generate a real one before production: new BCryptPasswordEncoder().encode("your-real-password")
INSERT INTO admins (email, password_hash, full_name)
VALUES (
    'admin@marketplace.local',
    '$2a$10$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga2FS.',
    'Bootstrap Admin'
);
