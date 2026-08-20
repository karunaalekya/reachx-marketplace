package com.marketplace.tax;

import com.marketplace.tax.model.TaxWithholdingRecord;
import com.marketplace.tax.repository.TaxWithholdingRecordRepository;
import com.marketplace.tax.service.TaxWithholdingService;
import com.marketplace.vendor.model.Vendor;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TaxWithholdingServiceTest {

    @Mock private TaxWithholdingRecordRepository withholdingRecordRepository;

    private TaxWithholdingService service() {
        return new TaxWithholdingService(withholdingRecordRepository);
    }

    private Vendor vendorWithPan(String state) {
        return Vendor.builder().id(1L).state(state).panNumber("ABCDE1234F").build();
    }

    @Test
    void tcs_isOnePercentOfGross_intraState_whenCustomerStateMatchesVendorState() {
        when(withholdingRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        Vendor vendor = vendorWithPan("Karnataka");

        TaxWithholdingService.Computation result = service()
                .computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Karnataka");

        assertEquals(0, BigDecimal.valueOf(10.00).compareTo(result.tcsAmount()));

        ArgumentCaptor<TaxWithholdingRecord> captor = ArgumentCaptor.forClass(TaxWithholdingRecord.class);
        org.mockito.Mockito.verify(withholdingRecordRepository, org.mockito.Mockito.times(2)).save(captor.capture());
        List<TaxWithholdingRecord> saved = captor.getAllValues();

        TaxWithholdingRecord tcsRecord = saved.stream()
                .filter(r -> r.getTaxType() == TaxWithholdingRecord.TaxType.TCS).findFirst().orElseThrow();
        assertEquals(TaxWithholdingRecord.SupplyType.INTRA_STATE, tcsRecord.getSupplyType());
    }

    @Test
    void tcs_marksInterState_whenCustomerStateDiffersFromVendorState() {
        when(withholdingRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        Vendor vendor = vendorWithPan("Karnataka");

        ArgumentCaptor<TaxWithholdingRecord> captor = ArgumentCaptor.forClass(TaxWithholdingRecord.class);
        service().computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Maharashtra");
        org.mockito.Mockito.verify(withholdingRecordRepository, org.mockito.Mockito.times(2)).save(captor.capture());

        TaxWithholdingRecord tcsRecord = captor.getAllValues().stream()
                .filter(r -> r.getTaxType() == TaxWithholdingRecord.TaxType.TCS).findFirst().orElseThrow();
        assertEquals(TaxWithholdingRecord.SupplyType.INTER_STATE, tcsRecord.getSupplyType());
    }

    @Test
    void tcs_throws_whenCustomerStateMissing() {
        Vendor vendor = vendorWithPan("Karnataka");
        assertThrows(IllegalStateException.class, () ->
                service().computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), null));
    }

    @Test
    void tcs_throws_whenVendorStateMissing() {
        Vendor vendor = Vendor.builder().id(1L).panNumber("ABCDE1234F").build();
        assertThrows(IllegalStateException.class, () ->
                service().computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Karnataka"));
    }

    @Test
    void tds_appliesOnePercent_whenVendorHasPan() {
        when(withholdingRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        Vendor vendor = vendorWithPan("Karnataka");

        TaxWithholdingService.Computation result = service()
                .computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Karnataka");

        assertEquals(0, BigDecimal.valueOf(10.00).compareTo(result.tdsAmount()));
    }

    @Test
    void tds_appliesFivePercentSec206AA_whenVendorHasNoPan() {
        when(withholdingRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        Vendor vendor = Vendor.builder().id(1L).state("Karnataka").panNumber(null).build();

        TaxWithholdingService.Computation result = service()
                .computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Karnataka");

        assertEquals(0, BigDecimal.valueOf(50.00).compareTo(result.tdsAmount()));
    }

    @Test
    void totalWithheld_sumsTcsAndTds() {
        when(withholdingRecordRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        Vendor vendor = vendorWithPan("Karnataka");

        TaxWithholdingService.Computation result = service()
                .computeAndRecord(50L, 10L, vendor, BigDecimal.valueOf(1000), "Karnataka");

        assertEquals(0, BigDecimal.valueOf(20.00).compareTo(result.totalWithheld()));
    }
}
