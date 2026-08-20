package com.marketplace.common.util;

import java.math.BigDecimal;
import java.math.RoundingMode;

// This system charges prices to the customer as tax-inclusive (see InvoiceService.buildInvoice's
// documented reasoning: the invoice total must match what the customer actually paid via the
// gateway, so GST is extracted from within the collected amount rather than added on top).
// OrderService's checkout-total tax figure and InvoiceService's per-vendor invoice tax both need
// that exact same extraction math, so it lives here once instead of twice.
public final class GstExtractor {
    private GstExtractor() {}

    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

    public record Breakdown(BigDecimal taxableValue, BigDecimal taxAmount) {}

    /**
     * Splits a tax-inclusive amount into its taxable value and the GST embedded within it.
     *
     * @param taxInclusiveTotal the amount actually charged/collected, GST already included
     * @param ratePercent       the GST rate as a percentage, e.g. 18.00 for 18%
     */
    public static Breakdown extract(BigDecimal taxInclusiveTotal, BigDecimal ratePercent) {
        BigDecimal divisor = BigDecimal.ONE.add(ratePercent.divide(ONE_HUNDRED, 4, RoundingMode.HALF_UP));
        BigDecimal taxableValue = taxInclusiveTotal.divide(divisor, 2, RoundingMode.HALF_UP);
        BigDecimal taxAmount = taxInclusiveTotal.subtract(taxableValue);
        return new Breakdown(taxableValue, taxAmount);
    }
}
