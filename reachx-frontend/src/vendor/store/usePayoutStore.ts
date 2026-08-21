import { create } from "zustand";
import {
  CommissionRecord,
  PayoutRecord,
  TaxWithholdingTotals,
  currentFinancialYear,
  getPendingPayoutTotal,
  getTaxWithholding,
  listCommissions,
  listPayouts,
} from "../api/payoutApi";

// Separate file from useVendorStore.ts (KYC slice) per the scope note already on record there -
// composed alongside it, not merged into it.
//
// No persist middleware here, deliberately - not even a partialized allow-list like the KYC
// store uses. Every field this store holds is either derived per-order financial data
// (grossAmount/commissionAmount/tcsAmount/tdsAmount/vendorNetPayable per order) or a live
// settlement status - strictly more sensitive than the KYC store's rejectionReason/documentUrl,
// which was already excluded from localStorage for being unencrypted and readable by any script
// on the origin. On reload this refetches from the backend, same as KYC does for its own
// excluded fields.

interface LedgerRow {
  orderId: number;
  commission: CommissionRecord | null;
  payout: PayoutRecord | null;
}

interface PayoutState {
  vendorId: number | null;
  commissions: CommissionRecord[];
  payouts: PayoutRecord[];
  pendingPayoutTotal: number | null;
  taxYear: string;
  taxTotals: TaxWithholdingTotals | null;
  // Payouts that flipped to COMPLETED on the most recent fetchLedger call, vs. their previously
  // known status - the ledger component watches this to fire a settlement toast, then clears it.
  // Not persisted or restored across a fresh mount - only meaningful as a diff against this
  // session's own prior fetch, never against nothing (a first load is never "newly" anything).
  newlySettledPayouts: PayoutRecord[];
  isLoading: boolean;
  isLoadingTax: boolean;
  error: string | null;

  setVendorContext: (vendorId: number) => void;
  fetchLedger: (token: string) => Promise<void>;
  fetchTaxTotals: (token: string, financialYear?: string) => Promise<void>;
  setTaxYear: (financialYear: string) => void;
  clearNewlySettled: () => void;
  ledgerRows: () => LedgerRow[];
}

export const usePayoutStore = create<PayoutState>()((set, get) => ({
  vendorId: null,
  commissions: [],
  payouts: [],
  pendingPayoutTotal: null,
  taxYear: currentFinancialYear(),
  taxTotals: null,
  newlySettledPayouts: [],
  isLoading: false,
  isLoadingTax: false,
  error: null,

  setVendorContext: (vendorId) => set({ vendorId }),

  // Fetches commissions, payouts, and the pending-payout total together - the ledger view needs
  // all three to render a single row (commission line-item joined to its settlement status), and
  // partial data would render a misleading half-row.
  fetchLedger: async (token) => {
    set({ isLoading: true, error: null });
    try {
      const previousPayouts = get().payouts;
      const previousById = new Map(previousPayouts.map((p) => [p.id, p.status]));

      // page=0, size=100: this project has no infinite-scroll/pagination UI decided yet for the
      // ledger (not on record anywhere) - one bounded page is enough for a pilot-scale vendor's
      // order volume without inventing pagination controls nobody asked for this session.
      const [commissionsPage, payoutsPage, pendingPayoutTotal] = await Promise.all([
        listCommissions(token, 0, 100),
        listPayouts(token, 0, 100),
        getPendingPayoutTotal(token),
      ]);

      const newlySettled = payoutsPage.content.filter(
        (p) => p.status === "COMPLETED" && previousById.get(p.id) !== "COMPLETED" && previousById.has(p.id)
      );

      set({
        commissions: commissionsPage.content,
        payouts: payoutsPage.content,
        pendingPayoutTotal,
        newlySettledPayouts: newlySettled,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load payout ledger.",
      });
    }
  },

  fetchTaxTotals: async (token, financialYear) => {
    const fy = financialYear ?? get().taxYear;
    set({ isLoadingTax: true, error: null });
    try {
      const taxTotals = await getTaxWithholding(token, fy);
      set({ taxTotals, isLoadingTax: false });
    } catch (err) {
      set({
        isLoadingTax: false,
        error: err instanceof Error ? err.message : "Failed to load tax withholding totals.",
      });
    }
  },

  setTaxYear: (financialYear) => set({ taxYear: financialYear }),

  clearNewlySettled: () => set({ newlySettledPayouts: [] }),

  // Joins commission line-items to their settlement record by orderId - a Payout is only created
  // once PayoutService actually sweeps a commission record (see V15 migration /
  // PayoutEligibleEvent), so a PENDING commission with no matching payout yet is expected and
  // rendered as "not yet settled", not as missing data.
  ledgerRows: () => {
    const { commissions, payouts } = get();
    const payoutByOrderId = new Map(payouts.map((p) => [p.orderId, p]));
    return commissions.map((commission) => ({
      orderId: commission.orderId,
      commission,
      payout: payoutByOrderId.get(commission.orderId) ?? null,
    }));
  },
}));
