package com.marketplace.tax.service;

import com.marketplace.tax.dto.TaxWithholdingSummary;
import com.marketplace.tax.model.TaxWithholdingRecord;
import com.marketplace.tax.repository.TaxWithholdingRecordRepository;
import com.marketplace.vendor.model.Vendor;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

// Computes and records the two statutory withholdings this platform, as the e-commerce
// operator, is legally required to apply on every vendor sale - separate from the GST the
// vendor charges the customer on their own invoice (InvoiceService/V13, already built):
//
//   TCS - Sec 52, CGST Act: operator collects 1% of the net value of taxable supplies made
//     through the platform. No threshold - applies from the first rupee. Split CGST+SGST
//     0.5%/0.5% for intra-state, IGST 1% for inter-state, using the exact same
//     customerState-vs-vendor.state comparison InvoiceService already does for output GST
//     (reused here, not re-derived, so the two "same transaction, same place of supply" checks
//     can't silently disagree).
//
//   TDS - Sec 194-O, Income Tax Act: operator deducts 1% of the gross sale amount before
//     paying the vendor (5% under Sec 206AA if the vendor has no PAN on file - the standard
//     no-PAN penalty rate for any TDS provision).
//
// Documented simplification, same posture as InvoiceService's flat-18%-GST decision: Sec 194-O
// technically only bites once a vendor's cumulative gross sales through this operator cross
// ₹5,00,000 in a financial year, but there's no per-vendor-per-FY running-total lookup in this
// schema yet - so TDS is deducted on every commission record unconditionally. Over-withholding
// below the real threshold is a vendor reclaiming excess credit at ITR time (recoverable);
// under-withholding is the OPERATOR facing interest+penalty under the Act (not recoverable after
// the fact) - so this is the safer direction to be wrong in, not a shortcut taken lightly.
// TCS has no such threshold question - it applies unconditionally by law.
@Service
@RequiredArgsConstructor
@Slf4j
public class TaxWithholdingService {

    private static final BigDecimal TCS_RATE_PERCENT = new BigDecimal("1.00");
    private static final BigDecimal TDS_RATE_PERCENT_WITH_PAN = new BigDecimal("1.00");
    private static final BigDecimal TDS_RATE_PERCENT_NO_PAN = new BigDecimal("5.00");
    private static final BigDecimal ONE_HUNDRED = new BigDecimal("100");

    private final TaxWithholdingRecordRepository withholdingRecordRepository;

    public record Computation(BigDecimal tcsAmount, BigDecimal tdsAmount) {
        public BigDecimal totalWithheld() {
            return tcsAmount.add(tdsAmount);
        }
    }

    // Computes both amounts and persists the two filing-snapshot rows. Caller (CommissionService)
    // runs this inside its own @Transactional boundary at order.paid time - same event that
    // already snapshots the commission rate, so TCS/TDS get the identical "as of the moment of
    // sale" treatment the rest of this record already gets.
    public Computation computeAndRecord(Long commissionRecordId, Long orderId, Vendor vendor,
                                          BigDecimal grossAmount, String customerState) {

        String financialYear = currentFinancialYear();

        BigDecimal tcsAmount = computeAndRecordTcs(
                commissionRecordId, orderId, vendor, grossAmount, customerState, financialYear);
        BigDecimal tdsAmount = computeAndRecordTds(
                commissionRecordId, orderId, vendor, grossAmount, financialYear);

        return new Computation(tcsAmount, tdsAmount);
    }

    private BigDecimal computeAndRecordTcs(Long commissionRecordId, Long orderId, Vendor vendor,
                                            BigDecimal grossAmount, String customerState, String financialYear) {

        // Same fail-loud posture as InvoiceService: a wrong place-of-supply call is a compliance
        // problem, not a cosmetic one, so a missing state blocks TCS computation rather than
        // guessing intra vs inter-state. This mirrors InvoiceService's existing check exactly -
        // if that check ever passes, this one must too, since both run off the same order/vendor.
        if (customerState == null || customerState.isBlank()) {
            throw new IllegalStateException(
                    "Order " + orderId + " has no customerState - cannot determine TCS place of supply.");
        }
        if (vendor.getState() == null || vendor.getState().isBlank()) {
            throw new IllegalStateException(
                    "Vendor " + vendor.getId() + " has no state set - cannot determine TCS place of supply.");
        }

        boolean intraState = customerState.trim().equalsIgnoreCase(vendor.getState().trim());
        TaxWithholdingRecord.SupplyType supplyType = intraState
                ? TaxWithholdingRecord.SupplyType.INTRA_STATE
                : TaxWithholdingRecord.SupplyType.INTER_STATE;

        BigDecimal tcsAmount = grossAmount.multiply(TCS_RATE_PERCENT)
                .divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);
        // Split (CGST+SGST vs IGST) is not separately persisted per-half here - GSTR-8 reporting
        // needs the total TCS amount plus the supply_type to derive the split at filing time,
        // matching how InvoiceService itself only needs the same two inputs.

        TaxWithholdingRecord record = TaxWithholdingRecord.builder()
                .commissionRecordId(commissionRecordId)
                .orderId(orderId)
                .vendorId(vendor.getId())
                .taxType(TaxWithholdingRecord.TaxType.TCS)
                .supplyType(supplyType)
                .ratePercent(TCS_RATE_PERCENT)
                .taxableValue(grossAmount)
                .amount(tcsAmount)
                .vendorPanOnFile(vendor.getPanNumber())
                .financialYear(financialYear)
                .build();
        withholdingRecordRepository.save(record);

        log.info("TCS recorded: commissionRecordId={} vendorId={} supplyType={} amount={}",
                commissionRecordId, vendor.getId(), supplyType, tcsAmount);

        return tcsAmount;
    }

    private BigDecimal computeAndRecordTds(Long commissionRecordId, Long orderId, Vendor vendor,
                                            BigDecimal grossAmount, String financialYear) {

        boolean hasPan = vendor.getPanNumber() != null && !vendor.getPanNumber().isBlank();
        BigDecimal rate = hasPan ? TDS_RATE_PERCENT_WITH_PAN : TDS_RATE_PERCENT_NO_PAN;

        if (!hasPan) {
            log.warn("Vendor {} has no PAN on file - applying Sec 206AA no-PAN TDS rate ({}%) "
                    + "instead of the standard Sec 194-O rate ({}%) for commissionRecordId={}",
                    vendor.getId(), TDS_RATE_PERCENT_NO_PAN, TDS_RATE_PERCENT_WITH_PAN, commissionRecordId);
        }

        BigDecimal tdsAmount = grossAmount.multiply(rate)
                .divide(ONE_HUNDRED, 2, RoundingMode.HALF_UP);

        TaxWithholdingRecord record = TaxWithholdingRecord.builder()
                .commissionRecordId(commissionRecordId)
                .orderId(orderId)
                .vendorId(vendor.getId())
                .taxType(TaxWithholdingRecord.TaxType.TDS)
                .supplyType(null)   // place-of-supply is a GST concept, not applicable under Income Tax Act
                .ratePercent(rate)
                .taxableValue(grossAmount)
                .amount(tdsAmount)
                .vendorPanOnFile(vendor.getPanNumber())
                .financialYear(financialYear)
                .build();
        withholdingRecordRepository.save(record);

        log.info("TDS recorded: commissionRecordId={} vendorId={} panOnFile={} rate={}% amount={}",
                commissionRecordId, vendor.getId(), hasPan, rate, tdsAmount);

        return tdsAmount;
    }

    // Per-vendor summary for a financial year + tax type - the shape GSTR-8 (TCS, monthly, but
    // reportable per-vendor for a whole FY here) and a TDS quarterly return both actually need:
    // one line per vendor with total taxable value and total withheld. Grouped in-memory rather
    // than a DB-side GROUP BY since filing-report volume (one row per vendor per FY) is small
    // enough not to need it, and keeping the aggregation in Java makes it trivial to verify
    // against the raw records during an audit.
    public List<TaxWithholdingSummary> summarize(String financialYear, TaxWithholdingRecord.TaxType taxType) {
        List<TaxWithholdingRecord> records = withholdingRecordRepository
                .findByFinancialYearAndTaxTypeOrderByVendorIdAsc(financialYear, taxType);

        Map<Long, List<TaxWithholdingRecord>> byVendor = records.stream()
                .collect(Collectors.groupingBy(TaxWithholdingRecord::getVendorId));

        return byVendor.entrySet().stream()
                .map(entry -> new TaxWithholdingSummary(
                        entry.getKey(),
                        financialYear,
                        taxType.name(),
                        entry.getValue().stream().map(TaxWithholdingRecord::getTaxableValue)
                                .reduce(BigDecimal.ZERO, BigDecimal::add),
                        entry.getValue().stream().map(TaxWithholdingRecord::getAmount)
                                .reduce(BigDecimal.ZERO, BigDecimal::add),
                        entry.getValue().size()))
                .sorted(Comparator.comparing(TaxWithholdingSummary::vendorId))
                .toList();
    }

    // Same Apr1-Mar31 Indian FY convention as InvoiceNumberGenerator - kept identical
    // deliberately so a GSTR-8/TDS report and a GST invoice report for the "same period" never
    // disagree on what that period actually spans.
    private String currentFinancialYear() {
        ZonedDateTime now = Instant.now().atZone(ZoneOffset.UTC);
        int year = now.getYear();
        int startYear = now.getMonthValue() >= 4 ? year : year - 1;
        int endYearShort = (startYear + 1) % 100;
        return "%d-%02d".formatted(startYear, endYearShort);
    }
}
