import { create } from "zustand";
import { getVendorTaxWithholding, currentFinancialYear, type TaxWithholdingTotals } from "../../vendor/api/payoutApi";

// No persist - a vendor's TCS/TDS totals are financial data about someone other than the logged
// -in user, same reasoning as useAdminKycStore.ts / useAdminDisputeStore.ts.
//
// No admin-scoped equivalent of GET /commissions/mine or GET /payouts/mine is confirmed anywhere
// in this codebase or its docs - only the FY tax-totals endpoint (getVendorTaxWithholding,
// itself flagged as inferred in payoutApi.ts) has a named ADMIN-only counterpart on record. This
// store - and the panel built on it - is scoped to that one confirmed-to-exist surface, not a
// full admin payout ledger. Building a per-order admin commission/payout view would be inventing
// an endpoint this project's own discipline has repeatedly rejected doing (see payoutApi.ts's own
// header comment on the CGST/SGST/IGST split, or navConfig.ts's category-picker precedent) -
// flag to the project owner if that's real near-term scope, don't guess a shape for it here.

interface AdminTaxState {
  vendorId: number | null;
  financialYear: string;
  totals: TaxWithholdingTotals | null;
  isLoading: boolean;
  error: string | null;

  lookup: (vendorId: number, financialYear: string, token: string) => Promise<void>;
  setFinancialYear: (fy: string) => void;
  reset: () => void;
}

export const useAdminTaxStore = create<AdminTaxState>()((set) => ({
  vendorId: null,
  financialYear: currentFinancialYear(),
  totals: null,
  isLoading: false,
  error: null,

  lookup: async (vendorId, financialYear, token) => {
    set({ isLoading: true, error: null, totals: null, vendorId, financialYear });
    try {
      const totals = await getVendorTaxWithholding(vendorId, financialYear, token);
      set({ totals, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load tax withholding totals.",
      });
    }
  },

  setFinancialYear: (fy) => set({ financialYear: fy }),

  reset: () => set({ vendorId: null, totals: null, error: null }),
}));
