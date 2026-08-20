package com.marketplace.tax.controller;

import com.marketplace.common.security.CurrentVendor;
import com.marketplace.tax.dto.TaxWithholdingSummary;
import com.marketplace.tax.model.TaxWithholdingRecord;
import com.marketplace.tax.repository.TaxWithholdingRecordRepository;
import com.marketplace.tax.service.TaxWithholdingService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/tax-withholding")
@RequiredArgsConstructor
public class TaxWithholdingController {

    private final TaxWithholdingService taxWithholdingService;
    private final TaxWithholdingRecordRepository withholdingRecordRepository;

    // Admin: per-vendor GSTR-8 (TCS) or TDS-quarterly summary for a financial year - the shape
    // needed to actually prepare either filing. taxType is a plain path variable rather than the
    // enum directly so an invalid value returns a normal 400 via Spring's enum-conversion
    // failure handler, same pattern already used elsewhere in this codebase for enum path params.
    @GetMapping("/report/{financialYear}/{taxType}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<List<TaxWithholdingSummary>> report(
            @PathVariable String financialYear,
            @PathVariable TaxWithholdingRecord.TaxType taxType) {
        return ResponseEntity.ok(taxWithholdingService.summarize(financialYear, taxType));
    }

    // Admin: raw per-order withholding records for a vendor, for support/reconciliation drill-down
    // behind the summary report above - mirrors InvoiceController's vendor/{vendorId} pattern.
    @GetMapping("/vendor/{vendorId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<Page<TaxWithholdingRecord>> byVendor(
            @PathVariable Long vendorId, Pageable pageable) {
        return ResponseEntity.ok(withholdingRecordRepository.findByVendorId(vendorId, pageable));
    }

    // Vendor: their own withheld TCS + TDS totals for a financial year, so they can reconcile
    // against what actually lands in their GST/income-tax credit - same self-service transparency
    // principle as GET /commissions/mine and GET /invoices/mine.
    @GetMapping("/mine/{financialYear}")
    @PreAuthorize("hasRole('VENDOR')")
    public ResponseEntity<Map<String, BigDecimal>> mine(
            @CurrentVendor Long vendorId, @PathVariable String financialYear) {
        BigDecimal tcs = withholdingRecordRepository.sumByVendorAndFinancialYearAndTaxType(
                vendorId, financialYear, TaxWithholdingRecord.TaxType.TCS);
        BigDecimal tds = withholdingRecordRepository.sumByVendorAndFinancialYearAndTaxType(
                vendorId, financialYear, TaxWithholdingRecord.TaxType.TDS);
        return ResponseEntity.ok(Map.of("tcs", tcs, "tds", tds));
    }
}
