import { create } from "zustand";
import {
  listDisputesByStatus,
  resolveDispute,
  type Dispute,
  type DisputeStatus,
  type DisputeResolution,
} from "../api/adminDisputesApi";
import type { Page } from "../../vendor/api/payoutApi";

// Per-domain zustand store, mirrors useAdminKycStore.ts's pattern (own store per Track B
// session, not folded into one global admin store).

interface AdminDisputesState {
  statusFilter: DisputeStatus;
  disputes: Page<Dispute> | null;
  disputesLoading: boolean;
  disputesError: string | null;

  selectedDispute: Dispute | null;

  // Single in-flight flag, not a per-id array like useAdminKycStore's decidingDocumentIds - the
  // detail pane only ever resolves the one currently-selected dispute, so there's no equivalent
  // to "PAN and GSTIN decided independently in the same view" here.
  resolving: boolean;
  resolutionError: string | null;

  fetchDisputes: (token: string, status?: DisputeStatus, page?: number) => Promise<void>;
  setStatusFilter: (status: DisputeStatus, token: string) => Promise<void>;
  selectDispute: (dispute: Dispute) => void;
  clearSelection: () => void;
  resolve: (resolution: DisputeResolution, notes: string, token: string) => Promise<void>;
}

export const useAdminDisputesStore = create<AdminDisputesState>()((set, get) => ({
  statusFilter: "OPEN",
  disputes: null,
  disputesLoading: false,
  disputesError: null,

  selectedDispute: null,

  resolving: false,
  resolutionError: null,

  fetchDisputes: async (token, status, page = 0) => {
    const effectiveStatus = status ?? get().statusFilter;
    set({ disputesLoading: true, disputesError: null });
    try {
      const result = await listDisputesByStatus(effectiveStatus, token, page);
      set({ disputes: result, disputesLoading: false });
    } catch (err) {
      set({
        disputesLoading: false,
        disputesError: err instanceof Error ? err.message : "Failed to load disputes.",
      });
    }
  },

  setStatusFilter: async (status, token) => {
    // Changing the filter drops the current selection - a dispute selected under "Open" has no
    // guaranteed place in the "Refunded" list, and the detail pane's resolve controls are
    // meaningless for a status the admin didn't navigate to on purpose.
    set({ statusFilter: status, selectedDispute: null, resolutionError: null });
    await get().fetchDisputes(token, status, 0);
  },

  // No GET /disputes/{id} re-fetch on selection - the by-status list already returns the full
  // DisputeResponse per row (id, orderId, vendorId, raisedByEmail, category, description,
  // status, resolutionNotes, resolvedAt, createdAt), same discipline useAdminKycStore's
  // selectVendor applies to VendorSummary rows from the pending-kyc list. The single-dispute
  // endpoint stays unwrapped in adminDisputesApi.ts until a real deep-linking use appears.
  selectDispute: (dispute) => set({ selectedDispute: dispute, resolutionError: null }),

  clearSelection: () => set({ selectedDispute: null, resolutionError: null }),

  resolve: async (resolution, notes, token) => {
    const { selectedDispute, resolving } = get();
    if (!selectedDispute || resolving) return;

    set({ resolving: true, resolutionError: null });

    try {
      // No optimistic UI - wait for the real backend response, per the production-UX baseline.
      // A resolved dispute may still involve an async gateway refund server-side (see
      // DisputeService.resolve() / RefundService), but the dispute record itself - the thing
      // this screen renders - is only ever shown once the PATCH actually returns it.
      const updated = await resolveDispute(selectedDispute.id, { resolution, notes }, token);

      set({ selectedDispute: updated, resolving: false });

      // A resolved dispute drops out of whatever status filter is currently active (OPEN /
      // UNDER_REVIEW) - real refetch of the current page, not a client-side removal guess.
      const { disputes, statusFilter } = get();
      await get().fetchDisputes(token, statusFilter, disputes?.number ?? 0);
    } catch (err) {
      set({
        resolving: false,
        resolutionError:
          err instanceof Error ? err.message : "Resolution failed. Try again.",
      });
      throw err;
    }
  },
}));
