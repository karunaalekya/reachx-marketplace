package com.marketplace.invoice.service;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;

// Allocates the next sequential invoice number for a vendor within an Indian financial year
// (Apr 1 - Mar 31). GST law requires this sequence to be unbroken per seller - a plain
// "SELECT COUNT(*) + 1" is not safe under concurrent invoice generation (two shipments for the
// same vendor created in the same instant could read the identical count and collide on the
// same number). INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING is atomic at the DB level,
// so this is safe under real concurrency without needing an explicit application-level lock.
@Component
@RequiredArgsConstructor
public class InvoiceNumberGenerator {

    private final JdbcTemplate jdbcTemplate;

    private static final String ALLOCATE_SQL = """
            INSERT INTO invoice_sequences (vendor_id, financial_year, last_number)
            VALUES (?, ?, 1)
            ON CONFLICT (vendor_id, financial_year)
            DO UPDATE SET last_number = invoice_sequences.last_number + 1
            RETURNING last_number
            """;

    // Caller must run this inside the same transaction as the invoice row insert - if the
    // transaction rolls back after allocating a number, that number is simply skipped (a gap,
    // not a reuse), which GST rules tolerate; reusing a number would not be tolerated.
    public Allocation allocateNext(Long vendorId) {
        String financialYear = currentFinancialYear();
        Integer sequenceNumber = jdbcTemplate.queryForObject(
                ALLOCATE_SQL, Integer.class, vendorId, financialYear);
        String invoiceNumber = "INV/%d/%s/%06d".formatted(vendorId, financialYear, sequenceNumber);
        return new Allocation(invoiceNumber, financialYear, sequenceNumber);
    }

    // Indian FY runs Apr 1 - Mar 31, expressed as e.g. "2026-27". Jan-Mar falls in the FY that
    // started the previous April.
    private String currentFinancialYear() {
        ZonedDateTime now = Instant.now().atZone(ZoneOffset.UTC);
        int year = now.getYear();
        int startYear = now.getMonthValue() >= 4 ? year : year - 1;
        int endYearShort = (startYear + 1) % 100;
        return "%d-%02d".formatted(startYear, endYearShort);
    }

    public record Allocation(String invoiceNumber, String financialYear, int sequenceNumber) {}
}
