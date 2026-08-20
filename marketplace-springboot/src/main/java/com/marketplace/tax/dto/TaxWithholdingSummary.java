package com.marketplace.tax.dto;

import java.math.BigDecimal;

// One row of a GSTR-8 (TCS) or TDS quarterly-return summary - one row per vendor per financial
// year per tax type. This is a reporting shape, not persisted directly; built from
// TaxWithholdingRecordRepository queries at request time.
public record TaxWithholdingSummary(
        Long vendorId,
        String financialYear,
        String taxType,
        BigDecimal totalTaxableValue,
        BigDecimal totalAmountWithheld,
        int recordCount
) {}
