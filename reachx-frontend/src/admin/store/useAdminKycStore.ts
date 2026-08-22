import { create } from "zustand";
import {
  listPendingKyc,
  listKycDocuments,
  decideKycDocument,
  type VendorSummary,
  type VendorKycDocument,
  type KycDocumentDecision,
} from "../api/adminKycApi";
import type { Page } from "../../vendor/api/payoutApi";

// Per-domain zustand store, mirrors the pattern in vendor/store/*.ts rather than one global
// admin store. Scoped to B1 (KYC queue) only - vendor management (B2), disputes (B3), etc. each
// get their own store in later sessions, not folded into this one.

interface AdminKycState {
  vendors: Page<VendorSummary> | null;
  vendorsLoading: boolean;
  vendorsError: string | null;

  selectedVendor: VendorSummary | null;
  documents: VendorKycDocument[];
  documentsLoading: boolean;
  documentsError: string | null;

  // Duplicate-submit protection is per-document, not a single global flag - approving PAN
  // shouldn't disable the GSTIN row's own controls. Holds the ids currently in flight.
  decidingDocumentIds: number[];
  decisionError: string | null;

  fetchPendingVendors: (token: string, page?: number) => Promise<void>;
  selectVendor: (vendor: VendorSummary, token: string) => Promise<void>;
  clearSelection: () => void;
  decideDocument: (
    documentId: number,
    decision: KycDocumentDecision,
    token: string
  ) => Promise<void>;
}

export const useAdminKycStore = create<AdminKycState>()((set, get) => ({
  vendors: null,
  vendorsLoading: false,
  vendorsError: null,

  selectedVendor: null,
  documents: [],
  documentsLoading: false,
  documentsError: null,

  decidingDocumentIds: [],
  decisionError: null,

  fetchPendingVendors: async (token, page = 0) => {
    set({ vendorsLoading: true, vendorsError: null });
    try {
      const result = await listPendingKyc(token, page);
      set({ vendors: result, vendorsLoading: false });
    } catch (err) {
      set({
        vendorsLoading: false,
        vendorsError: err instanceof Error ? err.message : "Failed to load pending vendors.",
      });
    }
  },

  selectVendor: async (vendor, token) => {
    set({
      selectedVendor: vendor,
      documents: [],
      documentsLoading: true,
      documentsError: null,
      decisionError: null,
    });
    try {
      const docs = await listKycDocuments(vendor.id, token);
      set({ documents: docs, documentsLoading: false });
    } catch (err) {
      set({
        documentsLoading: false,
        documentsError: err instanceof Error ? err.message : "Failed to load documents.",
      });
    }
  },

  clearSelection: () => set({ selectedVendor: null, documents: [], documentsError: null }),

  decideDocument: async (documentId, decision, token) => {
    const { selectedVendor, decidingDocumentIds } = get();
    if (!selectedVendor || decidingDocumentIds.includes(documentId)) return;

    set({
      decidingDocumentIds: [...decidingDocumentIds, documentId],
      decisionError: null,
    });

    try {
      // No optimistic UI - wait for the real backend response before reflecting the decision,
      // per the session plan's production-UX baseline (never show a fake "Approved ✓" before
      // the API confirms it).
      const updatedDoc = await decideKycDocument(selectedVendor.id, documentId, decision, token);

      set((state) => ({
        documents: state.documents.map((d) => (d.id === documentId ? updatedDoc : d)),
        decidingDocumentIds: state.decidingDocumentIds.filter((id) => id !== documentId),
      }));

      // A vendor's overall kycStatus can roll over (e.g. last required doc just got approved,
      // or a previously-approved vendor's doc just got rejected) as a side effect of this
      // decision - re-pull the pending-kyc list so a vendor who's now fully decided drops out
      // of the queue instead of lingering with stale state. Real refetch, not a client-side
      // guess at the new rollup.
      const { vendors } = get();
      await get().fetchPendingVendors(token, vendors?.number ?? 0);
    } catch (err) {
      set((state) => ({
        decidingDocumentIds: state.decidingDocumentIds.filter((id) => id !== documentId),
        decisionError: err instanceof Error ? err.message : "Decision failed. Try again.",
      }));
      throw err;
    }
  },
}));
