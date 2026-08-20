package com.marketplace.order.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

// Flat rate per vendor per order, waived above a free-shipping subtotal threshold - not a live
// carrier-rate lookup. This system has no product weight/dimension field to quote a real courier
// rate against at checkout time (Shiprocket rates are only resolved later, per-shipment, after
// payment - see ShippingService), so a real per-parcel rate can't be computed here. Documented
// simplification, same spirit as InvoiceService's flat (not per-HSN) GST rate: revisit if/when
// Product gains weight/dimensions and a pre-payment rate-check becomes possible.
//
// Charged per vendor, not per order, because each vendor in a multi-vendor order ships
// independently as its own parcel (see Shipment's own (order_id, vendor_id) uniqueness) - a
// single flat "per order" fee would undercharge a 3-vendor order relative to the 3 parcels it
// actually becomes.
@Component
public class ShippingCostCalculator {

    private final BigDecimal flatRatePerVendor;
    private final BigDecimal freeShippingThreshold;

    public ShippingCostCalculator(
            // Parsed explicitly from String rather than letting Spring bind @Value directly to
            // BigDecimal - that conversion path isn't exercised anywhere else in this codebase
            // (see every other @Value usage: all String/long), so it's not a proven-safe pattern
            // here. Explicit BigDecimal(String) parsing is unambiguous and fails loudly at
            // startup on a malformed value instead of surprising later.
            @Value("${shipping.flat-rate-per-vendor:49.00}") String flatRatePerVendor,
            @Value("${shipping.free-shipping-threshold:499.00}") String freeShippingThreshold) {
        this.flatRatePerVendor = new BigDecimal(flatRatePerVendor);
        this.freeShippingThreshold = new BigDecimal(freeShippingThreshold);
    }

    /**
     * @param vendorSubtotal sum of this vendor's own line totals on the order (not the whole
     *                       order's subtotal - free shipping is earned per vendor, since that's
     *                       also the unit each parcel/shipment is charged at).
     */
    public BigDecimal calculateForVendor(BigDecimal vendorSubtotal) {
        if (vendorSubtotal.compareTo(freeShippingThreshold) >= 0) {
            return BigDecimal.ZERO;
        }
        return flatRatePerVendor;
    }
}
