import { create } from "zustand";
import { VendorDispute, listMyDisputes } from "../api/disputesApi";

// No persist middleware - same reasoning as usePayoutStore.ts / useOrdersStore.ts. Read-only
// store: raising/resolving a dispute isn't a vendor-side action per DisputeController (raising
// is public/customer-facing, resolving is ADMIN-only) - see disputesApi.ts header comment.

interface DisputesState {
  vendorId: number | null;
  disputes: VendorDispute[];
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;

  setVendorContext: (vendorId: number) => void;
  fetchDisputes: (token: string, page?: number) => Promise<void>;
}

export const useDisputesStore = create<DisputesState>()((set, get) => ({
  vendorId: null,
  disputes: [],
  page: 0,
  totalPages: 0,
  isLoading: false,
  error: null,

  setVendorContext: (vendorId) => set({ vendorId }),

  fetchDisputes: async (token, page) => {
    const targetPage = page ?? get().page;
    set({ isLoading: true, error: null });
    try {
      const result = await listMyDisputes(token, targetPage);
      set({
        disputes: result.content,
        page: result.number,
        totalPages: result.totalPages,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load disputes.",
      });
    }
  },
}));
