import { create } from "zustand";
import {
  listPayouts,
  listVendorPayouts,
  retryPayout,
  type PayoutRecord,
  type PayoutStatus,
} from "../api/adminPayoutsApi";
import type { Page } from "../../vendor/api/payoutApi";

// Per-domain zustand store, mirrors useAdminDisputesStore.ts's pattern (own store per Track B
// session, not folded into one global admin store).

interface AdminPayoutsState {
  // undefined = no status filter (all statuses) - the session plan calls this an optional
  // filter, unlike disputes' required one, so "no filter" is a real, distinct state here, not
  // just "not yet chosen."
  statusFilter: PayoutStatus | undefined;

  // Scopes the ledger to one vendor via GET /payouts/vendor/{id} instead of the global
  // GET /payouts?status=X. null = global ledger. Set from the vendor-id filter input, or from a
  // cross-link (e.g. Vendor Management passing its own vendorId in later work).
  vendorIdFilter: number | null;

  payouts: Page<PayoutRecord> | null;
  payoutsLoading: boolean;
  payoutsError: string | null;

  // Per-row in-flight tracking, not a single flag - unlike the dispute detail pane (one
  // selected dispute at a time), this is a flat list where more than one FAILED row could
  // plausibly get retried by an admin in quick succession. Each id is independently
  // duplicate-submit-protected.
  retryingIds: number[];
  retryErrors: Record<number, string>;

  fetchPayouts: (token: string, page?: number) => Promise<void>;
  setStatusFilter: (status: PayoutStatus | undefined, token: string) => Promise<void>;
  setVendorIdFilter: (vendorId: number | null, token: string) => Promise<void>;
  retry: (id: number, token: string) => Promise<void>;
}

export const useAdminPayoutsStore = create<AdminPayoutsState>()((set, get) => ({
  statusFilter: undefined,
  vendorIdFilter: null,

  payouts: null,
  payoutsLoading: false,
  payoutsError: null,

  retryingIds: [],
  retryErrors: {},

  fetchPayouts: async (token, page = 0) => {
    const { statusFilter, vendorIdFilter } = get();
    set({ payoutsLoading: true, payoutsError: null });
    try {
      const result = vendorIdFilter
        ? await listVendorPayouts(vendorIdFilter, token, page)
        : await listPayouts(token, statusFilter, page);
      set({ payouts: result, payoutsLoading: false });
    } catch (err) {
      set({
        payoutsLoading: false,
        payoutsError: err instanceof Error ? err.message : "Failed to load payouts.",
      });
    }
  },

  setStatusFilter: async (status, token) => {
    // GET /payouts/vendor/{id} has no status query param in the session plan - switching the
    // status filter only makes sense against the global ledger, so it clears any vendor scope
    // rather than silently ignoring the new filter while still vendor-scoped.
    set({ statusFilter: status, vendorIdFilter: null });
    await get().fetchPayouts(token, 0);
  },

  setVendorIdFilter: async (vendorId, token) => {
    set({ vendorIdFilter: vendorId });
    await get().fetchPayouts(token, 0);
  },

  retry: async (id, token) => {
    if (get().retryingIds.includes(id)) return;

    set((state) => ({
      retryingIds: [...state.retryingIds, id],
      retryErrors: { ...state.retryErrors, [id]: "" },
    }));

    try {
      // No optimistic UI - the row keeps its current (FAILED) status on screen until this
      // resolves. The response is the real, server-confirmed row - never a client-side guess -
      // per the production-UX baseline's explicit payout-retry rule.
      const updated = await retryPayout(id, token);
      set((state) => {
        const { [id]: _removed, ...remainingErrors } = state.retryErrors;
        return {
          retryingIds: state.retryingIds.filter((rid) => rid !== id),
          retryErrors: remainingErrors,
          payouts: state.payouts
            ? {
                ...state.payouts,
                content: state.payouts.content.map((p) => (p.id === id ? updated : p)),
              }
            : state.payouts,
        };
      });
    } catch (err) {
      set((state) => ({
        retryingIds: state.retryingIds.filter((rid) => rid !== id),
        retryErrors: {
          ...state.retryErrors,
          [id]: err instanceof Error ? err.message : "Retry failed. Try again.",
        },
      }));
      throw err;
    }
  },
}));
