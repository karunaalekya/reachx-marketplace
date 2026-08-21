import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  KycDocType,
  VendorKycDocument,
  listKycDocuments,
  presignAndUploadToBucket,
  confirmBucketUpload,
} from "../api/kycApi";

// Scope note: this is the KYC slice only. The full useVendorStore (payout ledger, disputes) is
// a separate concern from a separate build pass and isn't reconstructed here - compose this in
// alongside those slices rather than treating this file as the whole store.

export type OverallKycStatus = "PENDING" | "APPROVED" | "REJECTED";

// A file that reached the bucket but whose confirm call to our backend never landed - the
// backend doesn't know this document exists yet, but nothing needs re-uploading. Held in memory
// only, not persisted (same reasoning as `documents`): surviving a reload isn't the goal here,
// surviving a network blip within the same session is. If the tab actually reloads mid-drop, the
// vendor sees "Not uploaded" again and re-uploads - a real but rare edge case, and the
// project's own design note is explicit that this in-memory scope is the accepted tradeoff, not
// an oversight.
interface PendingConfirm {
  docType: KycDocType;
  objectKey: string;
}

interface VendorKycState {
  vendorId: number | null;
  businessName: string | null;
  overallKycStatus: OverallKycStatus;
  documents: VendorKycDocument[];
  isLoading: boolean;
  error: string | null;
  pendingConfirm: PendingConfirm | null;

  setVendorContext: (vendorId: number, businessName: string) => void;
  fetchKycDocuments: (token: string) => Promise<void>;
  uploadDocument: (docType: KycDocType, file: File, token: string) => Promise<void>;
  retryConfirm: (token: string) => Promise<void>;
}

// Derives the overall status client-side from the same rule the backend uses
// (VendorService#recomputeOverallKycStatus): every required doc type APPROVED -> APPROVED, any
// required type REJECTED -> REJECTED, otherwise PENDING. This is a display-only mirror for
// optimistic UI - GET /vendors/{id} remains the source of truth for the vendor's actual
// kycStatus/status, this never substitutes for re-fetching that after a decision.
const REQUIRED_DOC_TYPES: KycDocType[] = ["PAN", "GSTIN", "BANK_CHEQUE"];

function deriveOverallStatus(documents: VendorKycDocument[]): OverallKycStatus {
  const byType = new Map(documents.map((d) => [d.docType, d]));
  const anyRequiredRejected = REQUIRED_DOC_TYPES.some(
    (type) => byType.get(type)?.status === "REJECTED"
  );
  if (anyRequiredRejected) return "REJECTED";

  const allRequiredApproved = REQUIRED_DOC_TYPES.every(
    (type) => byType.get(type)?.status === "APPROVED"
  );
  if (allRequiredApproved) return "APPROVED";

  return "PENDING";
}

export const useVendorKycStore = create<VendorKycState>()(
  persist(
    (set, get) => ({
      vendorId: null,
      businessName: null,
      overallKycStatus: "PENDING",
      documents: [],
      isLoading: false,
      error: null,
      pendingConfirm: null,

      setVendorContext: (vendorId, businessName) => set({ vendorId, businessName }),

      fetchKycDocuments: async (token) => {
        const { vendorId } = get();
        if (vendorId === null) {
          set({ error: "No vendor context set - call setVendorContext first." });
          return;
        }
        set({ isLoading: true, error: null });
        try {
          const documents = await listKycDocuments(vendorId, token);
          set({ documents, overallKycStatus: deriveOverallStatus(documents), isLoading: false });
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : "Failed to load KYC documents.",
          });
        }
      },

      uploadDocument: async (docType, file, token) => {
        const { vendorId, documents } = get();
        if (vendorId === null) {
          set({ error: "No vendor context set - call setVendorContext first." });
          return;
        }
        set({ isLoading: true, error: null, pendingConfirm: null });

        // Step 1: presign + PUT. A failure here means the file never reached the bucket - there
        // is nothing to reconcile, this is a plain upload failure like before.
        let objectKey: string;
        try {
          const result = await presignAndUploadToBucket(vendorId, docType, file, token);
          objectKey = result.objectKey;
        } catch (err) {
          set({
            isLoading: false,
            error: err instanceof Error ? err.message : "Upload failed.",
          });
          return;
        }

        // Step 2: confirm. A failure here is the real gap this fix addresses - the file is
        // already safe in the bucket, only the backend's record of it is missing. Surface this
        // as a distinct, retryable state rather than the generic upload-failed error, since
        // re-running step 1 would upload the same file a second time for no reason.
        try {
          const updated = await confirmBucketUpload(vendorId, objectKey, token);
          const next = [...documents.filter((d) => d.docType !== docType), updated];
          set({ documents: next, overallKycStatus: deriveOverallStatus(next), isLoading: false });
        } catch (err) {
          set({
            isLoading: false,
            pendingConfirm: { docType, objectKey },
            error:
              "Your file reached storage, but we couldn't confirm it with the server. " +
              "Retry confirming below - no need to re-upload.",
          });
        }
      },

      retryConfirm: async (token) => {
        const { vendorId, documents, pendingConfirm } = get();
        if (vendorId === null || pendingConfirm === null) return;
        set({ isLoading: true, error: null });
        try {
          const updated = await confirmBucketUpload(vendorId, pendingConfirm.objectKey, token);
          const next = [...documents.filter((d) => d.docType !== pendingConfirm.docType), updated];
          set({
            documents: next,
            overallKycStatus: deriveOverallStatus(next),
            isLoading: false,
            pendingConfirm: null,
          });
        } catch (err) {
          // Keep pendingConfirm intact so the retry button stays available - a second dropped
          // connection shouldn't lose track of the objectKey that's still safely in the bucket.
          set({
            isLoading: false,
            error:
              err instanceof Error
                ? `Still couldn't confirm: ${err.message}`
                : "Still couldn't confirm. You can try again.",
          });
        }
      },
    }),
    {
      name: "vendor-kyc-store",
      // Allow-list only. `documents` deliberately excluded - each entry carries a
      // storage-backed documentUrl and, for a rejected document, a rejectionReason describing
      // exactly what's wrong with a vendor's PAN/GSTIN/bank-cheque submission. None of that
      // belongs in localStorage: it's unencrypted, persists after logout, and is readable by
      // any other script running on the same origin. On reload, fetchKycDocuments re-fetches
      // the real list from the backend instead - this cache exists only to remember which
      // vendor is active, not to avoid a network call for anything sensitive.
      partialize: (state) => ({
        vendorId: state.vendorId,
        businessName: state.businessName,
        overallKycStatus: state.overallKycStatus,
      }),
    }
  )
);
