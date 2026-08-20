ALTER TABLE vendors
    ADD COLUMN address_line1 VARCHAR(255),
    ADD COLUMN address_line2 VARCHAR(255),
    ADD COLUMN city          VARCHAR(100),
    ADD COLUMN state         VARCHAR(100),
    ADD COLUMN pincode       VARCHAR(10),
    ADD COLUMN pickup_location_name VARCHAR(100);  -- Shiprocket pickup location identifier, registered separately in their dashboard per vendor
