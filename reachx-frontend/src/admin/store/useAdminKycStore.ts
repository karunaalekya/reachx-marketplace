import { create } from "zustand";
import { getVendor, type VendorSummary } from "../api/adminVendorApi";
import { listKycDocuments, decideKycDocument, type VendorKycDocument } from "../../vendor/api/kycApi";

// No persist middleware, stronger reasoning than usePayoutStore.ts's already-strict "no persist"
// call: this store looks up an ARBITRARY vendor's PAN/GSTIN/bank-cheque documents and rejection
// reasons by id, not the logged-in user's own. Caching any of that in localStorage under an
// admin's origin would be a worse version of the exact PII leak FRONTEND_STATE.md issue #7 fixed
// for the vendor's own store - not reintroducing it here for someone else's documents.
//
// Deliberately NOT a "queue" in the sense of a cross-vendor worklist: no endpoint to list all
// vendors with pending KYC documents has been confirmed anywhere in this codebase or its docs
// (only a single-vendor GET /vendors/{id}/kyc-documents exists). This is a lookup-by-id workflow
// instead - an admin who knows which vendor to review (e.g. from a support ticket or an
// out-of-band notification) pulls that vendor's full document set and decides on it here. If a
// real cross-vendor queue endpoint gets built, this store's `lookupVendor` step is what should
// be replaced by a real list fetch - the per-document decide flow below stays the same either way.

interface AdminKycState {
  vendor: VendorSummary | null;
  documents: VendorKycDocument[];
  isLoading: boolean;
  isDeciding: boolean;
  error: string | null;

  lookupVendor: (vendorId: number, token: string) => Promise<void>;
  decide: (
    documentId: number,
    decision: { approved: boolean; rejectionReason?: string },
    token: string
  ) => Promise<void>;
  reset: () => void;
}

export const useAdminKycStore = create<AdminKycState>()((set, get) => ({
  vendor: null,
  documents: [],
  isLoading: false,
  isDeciding: false,
  error: null,

  lookupVendor: async (vendorId, token) => {
    set({ isLoading: true, error: null, vendor: null, documents: [] });
    try {
      const [vendor, documents] = await Promise.all([
        getVendor(vendorId, token),
        listKycDocuments(vendorId, token),
      ]);
      set({ vendor, documents, isLoading: false });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load vendor.",
      });
    }
  },

  decide: async (documentId, decision, token) => {
    const { vendor, documents } = get();
    if (!vendor) return;
    set({ isDeciding: true, error: null });
    try {
      const updated = await decideKycDocument(vendor.id, documentId, decision, token);
      set({
        documents: documents.map((d) => (d.id === documentId ? updated : d)),
        isDeciding: false,
      });
      // The vendor's derived overallKycStatus (kycStatus on GET /vendors/{id}) can change as a
      // side effect of this decision - re-fetch the vendor summary rather than deriving it
      // client-side a second time (deriveOverallStatus already exists for the vendor's own store;
      // duplicating that logic here risks the two definitions drifting, and the backend is the
      // real source of truth for this admin-facing view anyway).
      const refreshedVendor = await getVendor(vendor.id, token);
      set({ vendor: refreshedVendor });
    } catch (err) {
      set({
        isDeciding: false,
        error: err instanceof Error ? err.message : "Failed to record decision.",
      });
    }
  },

  reset: () => set({ vendor: null, documents: [], error: null }),
}));
