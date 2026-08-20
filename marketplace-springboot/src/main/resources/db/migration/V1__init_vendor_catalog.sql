-- Vendor onboarding + catalog schema
-- Matches client spec: PostgreSQL, multi-vendor marketplace

CREATE TABLE vendors (
    id              BIGSERIAL PRIMARY KEY,
    business_name   VARCHAR(255) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    phone           VARCHAR(20)  NOT NULL,
    password_hash   VARCHAR(255) NOT NULL,
    gstin           VARCHAR(20),
    pan_number      VARCHAR(20),
    kyc_status      VARCHAR(20)  NOT NULL DEFAULT 'PENDING'
                        CHECK (kyc_status IN ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED')),
    kyc_document_url VARCHAR(512),
    rejection_reason VARCHAR(512),
    status          VARCHAR(20)  NOT NULL DEFAULT 'INACTIVE'
                        CHECK (status IN ('INACTIVE', 'ACTIVE', 'SUSPENDED')),
    commission_rate NUMERIC(5,2) NOT NULL DEFAULT 10.00,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX idx_vendors_kyc_status ON vendors(kyc_status);
CREATE INDEX idx_vendors_status ON vendors(status);

CREATE TABLE categories (
    id          BIGSERIAL PRIMARY KEY,
    name        VARCHAR(120) NOT NULL UNIQUE,
    slug        VARCHAR(120) NOT NULL UNIQUE,
    parent_id   BIGINT REFERENCES categories(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
    id              BIGSERIAL PRIMARY KEY,
    vendor_id       BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    category_id     BIGINT REFERENCES categories(id),
    name            VARCHAR(255) NOT NULL,
    slug            VARCHAR(255) NOT NULL,
    description     TEXT,
    price           NUMERIC(12,2) NOT NULL CHECK (price >= 0),
    stock_quantity  INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    sku             VARCHAR(100) NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'DRAFT'
                        CHECK (status IN ('DRAFT', 'ACTIVE', 'OUT_OF_STOCK', 'ARCHIVED')),
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_vendor_sku UNIQUE (vendor_id, sku)
);

CREATE INDEX idx_products_vendor_id ON products(vendor_id);
CREATE INDEX idx_products_category_id ON products(category_id);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_name_search ON products USING gin (to_tsvector('english', name));
