import { create } from "zustand";
import { getDispute, resolveDispute, type ResolveDisputeRequest } from "../api/adminDisputesApi";
import type { VendorDispute } from "../../vendor/api/disputesApi";

// No persist - same reasoning as useAdminKycStore.ts, a dispute's description/resolutionNotes
// can carry a customer's account of what went wrong with an order, not something to leave in
// localStorage under an admin's origin.
//
// Same "lookup by id, not a cross-vendor queue" shape as useAdminKycStore.ts, for the same
// reason: no GET /disputes (all, admin-scoped, paginated) endpoint is confirmed anywhere in this
// codebase or its docs - only GET /disputes/mine (vendor-scoped) and the single-dispute
// GET /disputes/{id} this session added (itself flagged as inferred, not confirmed - see
// adminDisputesApi.ts). An admin resolving disputes today needs the dispute id from wherever it
// was raised/escalated (e.g. a support ticket referencing the order), same real limitation as the
// KYC queue.

interface AdminDisputeState {
  dispute: VendorDispute | null;
  isLoading: boolean;
  isResolving: boolean;
  error: string | null;

  lookupDispute: (disputeId: number, token: string) => Promise<void>;
  resolve: (body: ResolveDisputeRequest, token: string) => Promise<void>;
  reset: () => void;
}

export const useAdminDisputeStore = create<AdminDisputeState>()((set, get) => ({
  dispute: null,
  isLoading: false,
  isResolving: false,
  error: null,

  lookupDispute: async (disputeId, token) => {
    set({ isLoading: true, error: null, dispute: null });
    try {
      const dispute = await getDispute(disputeId, token);
      set({ dispute, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load dispute.",
      });
    }
  },

  resolve: async (body, token) => {
    const { dispute } = get();
    if (!dispute) return;
    set({ isResolving: true, error: null });
    try {
      const updated = await resolveDispute(dispute.id, body, token);
      set({ dispute: updated, isResolving: false });
    } catch (err) {
      set({
        isResolving: false,
        error: err instanceof Error ? err.message : "Failed to resolve dispute.",
      });
    }
  },

  reset: () => set({ dispute: null, error: null }),
}));
