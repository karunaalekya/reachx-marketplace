import { useEffect, useRef, useState } from "react";
import { UploadCloud, FileText, Loader2, RefreshCw } from "lucide-react";
import { useVendorKycStore } from "../store/useVendorStore";
import { StatusBadge, InteractiveBadge } from "../../shared/components/VerificationBadgeStack";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import type { KycDocType } from "../api/kycApi";

// Doc type metadata lives here, not on the backend response - the backend only knows PAN /
// GSTIN / BANK_CHEQUE / MSME_CERTIFICATE as enum values plus a `required` boolean. Display
// labels and helper copy are a frontend concern.
const DOC_TYPE_META: Record<KycDocType, { label: string; helperText: string; required: boolean }> = {
  PAN: { label: "PAN card", helperText: "Business or proprietor PAN, clearly legible.", required: true },
  GSTIN: { label: "GST certificate", helperText: "Current GST registration certificate.", required: true },
  BANK_CHEQUE: {
    label: "Cancelled cheque",
    helperText: "For payout bank account verification.",
    required: true,
  },
  MSME_CERTIFICATE: {
    label: "MSME / Udyam certificate",
    helperText: "Optional - speeds up review, not required to go live.",
    required: false,
  },
};

const ALL_DOC_TYPES: KycDocType[] = ["PAN", "GSTIN", "BANK_CHEQUE", "MSME_CERTIFICATE"];

interface KycVerificationPanelProps {
  vendorId: number;
  businessName: string;
  authToken: string;
}

export function KycVerificationPanel({ vendorId, businessName, authToken }: KycVerificationPanelProps) {
  const {
    documents,
    isLoading,
    error,
    overallKycStatus,
    pendingConfirm,
    setVendorContext,
    fetchKycDocuments,
    uploadDocument,
    retryConfirm,
  } = useVendorKycStore();

  const [expandedReasonFor, setExpandedReasonFor] = useState<KycDocType | null>(null);
  const { toasts, pushToast, dismissToast } = useToasts();

  // Tracks which upload (if any) is currently in flight, and the docType label it's uploading -
  // this is what lets the isLoading-transition effect below tell "an upload just finished"
  // apart from "the initial document list fetch just finished", since both flip the same
  // isLoading flag through the same store slice.
  const pendingUploadRef = useRef<{ docType: KycDocType; label: string } | null>(null);
  const wasLoadingRef = useRef(false);

  useEffect(() => {
    setVendorContext(vendorId, businessName);
    fetchKycDocuments(authToken);
    // Runs once per vendor identity, not on every render - authToken can rotate without
    // re-triggering a fetch storm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    const justFinished = wasLoadingRef.current && !isLoading;
    const pending = pendingUploadRef.current;

    if (justFinished && pending) {
      if (pendingConfirm) {
        // Distinct from a real upload failure: the file did reach the bucket, only the
        // confirm call dropped. Saying "upload failed" here would be actively wrong and would
        // likely make a vendor re-select the file and upload it a second time for nothing.
        pushToast("saffron", `${pending.label} needs one more step`, "File saved - retry confirming below.");
      } else if (error) {
        // Deliberately NOT repeating `error` verbatim here - the persistent banner below
        // already renders the full message, and showing the exact same string in both the
        // banner and a transient toast at once is redundant, not informative. Found by the
        // interaction test in src/test/App.interaction.test.tsx, fixed here rather than in
        // the test (the duplication was a real UI issue, not a test-assertion bug).
        pushToast("chilli", `${pending.label} upload failed`, "See the error above for details.");
      } else {
        pushToast("neem", `${pending.label} submitted`, "Your document is now under review.");
      }
      pendingUploadRef.current = null;
    }

    wasLoadingRef.current = isLoading;
    // pushToast is stable (useCallback with no deps), error/isLoading/pendingConfirm are the
    // real triggers.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, error, pendingConfirm]);

  function handleFileSelected(docType: KycDocType, file: File | undefined) {
    if (!file) return;
    pendingUploadRef.current = { docType, label: DOC_TYPE_META[docType].label };
    uploadDocument(docType, file, authToken);
  }

  return (
    <section className="rounded-lg bg-surface-cardMuted p-6 space-y-5" aria-labelledby="kyc-panel-heading">
      <header className="flex items-center justify-between">
        <div>
          <h2 id="kyc-panel-heading" className="font-display text-xl text-brand-indigo">
            Verification documents
          </h2>
          <p className="text-sm opacity-70">
            Each document is reviewed independently - you can be approved on some while another
            is still pending.
          </p>
        </div>
        <StatusBadge
          status={overallKycStatus === "PENDING" ? "PENDING" : overallKycStatus}
          subtext="Overall status"
        />
      </header>

      {error && (
        <div className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text">
          <p>{error}</p>
          {pendingConfirm && (
            <button
              type="button"
              onClick={() => retryConfirm(authToken)}
              disabled={isLoading}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-tint-chilli-border px-3 py-1.5 text-xs font-medium hover:bg-tint-chilli-border/10 focus-visible:ring-2 focus-visible:ring-brand-indigo disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw size={14} aria-hidden="true" />
              )}
              Retry confirmation for {DOC_TYPE_META[pendingConfirm.docType].label}
            </button>
          )}
        </div>
      )}

      <ul className="divide-y divide-black/5">
        {ALL_DOC_TYPES.map((docType) => {
          const meta = DOC_TYPE_META[docType];
          const doc = documents.find((d) => d.docType === docType);

          return (
            <li key={docType} className="flex items-center justify-between gap-4 py-4">
              <div className="flex items-start gap-3">
                <FileText size={20} className="mt-0.5 text-brand-indigo/70" aria-hidden="true" />
                <div>
                  <p className="font-medium text-sm">
                    {meta.label}
                    {!meta.required && <span className="ml-2 text-xs opacity-60">(optional)</span>}
                  </p>
                  <p className="text-xs opacity-70">{meta.helperText}</p>
                  {expandedReasonFor === docType && doc?.rejectionReason && (
                    <p className="mt-1 text-xs text-tint-chilli-text">{doc.rejectionReason}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {doc ? (
                  doc.status === "REJECTED" ? (
                    <InteractiveBadge
                      status="REJECTED"
                      actionLabel={`View rejection reason for ${meta.label}`}
                      onClick={() =>
                        setExpandedReasonFor((current) => (current === docType ? null : docType))
                      }
                    />
                  ) : (
                    <StatusBadge status={doc.status} />
                  )
                ) : (
                  <span className="text-xs opacity-50">Not uploaded</span>
                )}

                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-brand-indigo/20 px-3 py-1.5 text-xs font-medium text-brand-indigo hover:bg-brand-indigo/5 focus-within:ring-2 focus-within:ring-brand-indigo">
                  {isLoading ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                  ) : (
                    <UploadCloud size={14} aria-hidden="true" />
                  )}
                  {doc ? "Replace" : "Upload"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="sr-only"
                    disabled={isLoading}
                    onChange={(e) => handleFileSelected(docType, e.target.files?.[0])}
                  />
                </label>
              </div>
            </li>
          );
        })}
      </ul>

      {toasts.map((toast) => (
        <OperationToast
          key={toast.id}
          id={toast.id}
          variant={toast.variant}
          message={toast.message}
          subText={toast.subText}
          onClose={dismissToast}
        />
      ))}
    </section>
  );
}
