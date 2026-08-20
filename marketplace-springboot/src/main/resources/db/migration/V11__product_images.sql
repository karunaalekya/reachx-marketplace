-- Product images: normalized as its own table (not a single column on products) since a
-- product needs multiple images with a defined display order, not just one.
-- Stores only the final object URL - the actual binary lives in S3-compatible storage
-- (AWS S3 / Cloudinary / Supabase Storage, all S3-API-compatible), uploaded directly from the
-- client via a presigned URL. This table never sees image bytes.
CREATE TABLE product_images (
    id              BIGSERIAL PRIMARY KEY,
    product_id      BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    image_url       VARCHAR(1024) NOT NULL,
    storage_key     VARCHAR(512) NOT NULL,   -- bucket object key, needed to delete the object later (URL alone isn't enough for the S3 delete API)
    display_order   INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product_id ON product_images(product_id);

-- Enforces a sane per-product cap (matches ProductImageService.MAX_IMAGES_PER_PRODUCT) at the
-- DB level too, not just in application code - a direct DB write or a future second app instance
-- with stale code shouldn't be able to bypass the limit.
CREATE OR REPLACE FUNCTION check_product_image_limit() RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM product_images WHERE product_id = NEW.product_id) >= 10 THEN
        RAISE EXCEPTION 'Product % already has the maximum of 10 images', NEW.product_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_product_image_limit
    BEFORE INSERT ON product_images
    FOR EACH ROW EXECUTE FUNCTION check_product_image_limit();
