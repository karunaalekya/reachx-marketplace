package com.marketplace.order.service;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ShippingCostCalculatorTest {

    private ShippingCostCalculator calculator() {
        return new ShippingCostCalculator("49.00", "499.00");
    }

    @Test
    void calculateForVendor_chargesFlatRate_whenBelowFreeShippingThreshold() {
        BigDecimal fee = calculator().calculateForVendor(BigDecimal.valueOf(250));
        assertEquals(0, fee.compareTo(new BigDecimal("49.00")));
    }

    @Test
    void calculateForVendor_isFree_whenAtFreeShippingThresholdExactly() {
        BigDecimal fee = calculator().calculateForVendor(new BigDecimal("499.00"));
        assertEquals(0, fee.compareTo(BigDecimal.ZERO));
    }

    @Test
    void calculateForVendor_isFree_whenAboveFreeShippingThreshold() {
        BigDecimal fee = calculator().calculateForVendor(BigDecimal.valueOf(1000));
        assertEquals(0, fee.compareTo(BigDecimal.ZERO));
    }

    @Test
    void calculateForVendor_chargesFlatRate_forZeroSubtotal() {
        BigDecimal fee = calculator().calculateForVendor(BigDecimal.ZERO);
        assertEquals(0, fee.compareTo(new BigDecimal("49.00")));
    }

    @Test
    void calculateForVendor_usesConfiguredRateAndThreshold_notHardcodedDefaults() {
        ShippingCostCalculator customCalculator = new ShippingCostCalculator("99.50", "1000.00");

        assertEquals(0, customCalculator.calculateForVendor(BigDecimal.valueOf(500))
                .compareTo(new BigDecimal("99.50")));
        assertEquals(0, customCalculator.calculateForVendor(BigDecimal.valueOf(1500))
                .compareTo(BigDecimal.ZERO));
    }
}
