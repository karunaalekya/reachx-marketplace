-- One shipment per vendor per order: a multi-vendor order splits into separate
-- Shiprocket shipments because each vendor ships from their own location.

CREATE TABLE shipments (
    id                  BIGSERIAL PRIMARY KEY,
    order_id            BIGINT NOT NULL REFERENCES orders(id),
    vendor_id           BIGINT NOT NULL REFERENCES vendors(id),
    shiprocket_order_id VARCHAR(100),
    shiprocket_shipment_id VARCHAR(100),
    awb_number          VARCHAR(50),
    courier_name        VARCHAR(100),
    status              VARCHAR(30) NOT NULL DEFAULT 'PENDING'
                            CHECK (status IN ('PENDING', 'CREATED', 'PICKUP_SCHEDULED',
                                               'SHIPPED', 'OUT_FOR_DELIVERY', 'DELIVERED',
                                               'FAILED', 'RTO')),
    failure_reason      VARCHAR(512),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_order_vendor_shipment UNIQUE (order_id, vendor_id)
);

CREATE INDEX idx_shipments_order_id ON shipments(order_id);
CREATE INDEX idx_shipments_vendor_id ON shipments(vendor_id);
CREATE INDEX idx_shipments_awb ON shipments(awb_number);
CREATE INDEX idx_shipments_status ON shipments(status);
