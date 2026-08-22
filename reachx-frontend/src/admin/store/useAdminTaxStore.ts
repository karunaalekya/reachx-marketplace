import { create } from "zustand";
import {
  currentFinancialYear,
  getTaxWithholdingReport,
  listVendorTaxWithholdingRecords,
  type Page,
  type TaxType,
  type TaxWithholdingOrderRecord,
  type TaxWithholdingSummary,
} from "../api/adminTaxApi";

// Per-domain zustand store, mirrors useAdminPayoutsStore.ts's pattern. Read-only module - no
// persist middleware (same "live business data, not cached across a reload" call as every other
// admin store in this project), and no mutation state at all (no in-flight/retry tracking) since
// this session ships no mutating endpoint - both real endpoints in the session plan are GETs.

interface AdminTaxState {
  financialYear: string;
  taxType: TaxType;

  // GET /tax-withholding/report/{fy}/{taxType} is not paginated per the session plan (see
  // adminTaxApi.ts's own comment) - a plain array, not a Page<T>.
  report: TaxWithholdingSummary[] | null;
  reportLoading: boolean;
  reportError: string | null;

  // Drill-down: which vendor's per-order records are currently expanded, if any. null = no
  // vendor selected, report list only.
  selectedVendorId: number | null;
  selectedVendorName: string | null;
  vendorRecords: Page<TaxWithholdingOrderRecord> | null;
  vendorRecordsLoading: boolean;
  vendorRecordsError: string | null;

  fetchReport: (token: string) => Promise<void>;
  setFinancialYear: (financialYear: string, token: string) => Promise<void>;
  setTaxType: (taxType: TaxType, token: string) => Promise<void>;
  selectVendor: (vendorId: number, businessName: string, token: string) => Promise<void>;
  fetchVendorRecords: (token: string, page?: number) => Promise<void>;
  clearVendorSelection: () => void;
}

export const useAdminTaxStore = create<AdminTaxState>()((set, get) => ({
  financialYear: currentFinancialYear(),
  taxType: "TCS",

  report: null,
  reportLoading: false,
  reportError: null,

  selectedVendorId: null,
  selectedVendorName: null,
  vendorRecords: null,
  vendorRecordsLoading: false,
  vendorRecordsError: null,

  fetchReport: async (token) => {
    const { financialYear, taxType } = get();
    set({ reportLoading: true, reportError: null });
    try {
      const result = await getTaxWithholdingReport(financialYear, taxType, token);
      set({ report: result, reportLoading: false });
    } catch (err) {
      set({
        reportLoading: false,
        reportError: err instanceof Error ? err.message : "Failed to load the tax report.",
      });
    }
  },

  setFinancialYear: async (financialYear, token) => {
    // Switching year or type clears any open drill-down - a vendor's per-order records only
    // make sense in the context of the report row that opened them, and that row is about to
    // change or disappear.
    set({ financialYear, selectedVendorId: null, selectedVendorName: null, vendorRecords: null });
    await get().fetchReport(token);
  },

  setTaxType: async (taxType, token) => {
    set({ taxType, selectedVendorId: null, selectedVendorName: null, vendorRecords: null });
    await get().fetchReport(token);
  },

  selectVendor: async (vendorId, businessName, token) => {
    set({
      selectedVendorId: vendorId,
      selectedVendorName: businessName,
      vendorRecords: null,
      vendorRecordsError: null,
    });
    await get().fetchVendorRecords(token, 0);
  },

  fetchVendorRecords: async (token, page = 0) => {
    const { selectedVendorId } = get();
    if (selectedVendorId === null) return;
    set({ vendorRecordsLoading: true, vendorRecordsError: null });
    try {
      const result = await listVendorTaxWithholdingRecords(selectedVendorId, token, page);
      set({ vendorRecords: result, vendorRecordsLoading: false });
    } catch (err) {
      set({
        vendorRecordsLoading: false,
        vendorRecordsError:
          err instanceof Error ? err.message : "Failed to load this vendor's tax records.",
      });
    }
  },

  clearVendorSelection: () =>
    set({
      selectedVendorId: null,
      selectedVendorName: null,
      vendorRecords: null,
      vendorRecordsError: null,
    }),
}));
