package com.marketplace.tax.repository;

import com.marketplace.tax.model.TaxWithholdingRecord;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface TaxWithholdingRecordRepository extends JpaRepository<TaxWithholdingRecord, Long> {

    Optional<TaxWithholdingRecord> findByCommissionRecordIdAndTaxType(
            Long commissionRecordId, TaxWithholdingRecord.TaxType taxType);

    Page<TaxWithholdingRecord> findByVendorId(Long vendorId, Pageable pageable);

    // GSTR-8 (TCS, filed monthly) and TDS quarterly returns are both filed per financial year,
    // scoped to one tax type at a time - this is the shape the admin reporting endpoint needs.
    List<TaxWithholdingRecord> findByFinancialYearAndTaxTypeOrderByVendorIdAsc(
            String financialYear, TaxWithholdingRecord.TaxType taxType);

    @Query("""
           SELECT COALESCE(SUM(t.amount), 0) FROM TaxWithholdingRecord t
           WHERE t.financialYear = :financialYear AND t.taxType = :taxType
           """)
    BigDecimal sumByFinancialYearAndTaxType(
            @Param("financialYear") String financialYear,
            @Param("taxType") TaxWithholdingRecord.TaxType taxType);

    @Query("""
           SELECT COALESCE(SUM(t.amount), 0) FROM TaxWithholdingRecord t
           WHERE t.vendorId = :vendorId AND t.financialYear = :financialYear AND t.taxType = :taxType
           """)
    BigDecimal sumByVendorAndFinancialYearAndTaxType(
            @Param("vendorId") Long vendorId,
            @Param("financialYear") String financialYear,
            @Param("taxType") TaxWithholdingRecord.TaxType taxType);
}
