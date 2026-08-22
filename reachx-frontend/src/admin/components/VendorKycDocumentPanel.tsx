import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, XCircle, ExternalLink, FileX } from "lucide-react";
import { useAdminKycStore } from "../store/useAdminKycStore";
import { StatusBadge } from "../../shared/components/VerificationBadgeStack";
import { ConfirmReasonDialog } from "../../shared/components/ConfirmReasonDialog";
import type { KycDocType, VendorKycDocument } from "../api/adminKycApi";

// Display metadata only - the backend only knows PAN/GSTIN/BANK_CHEQUE/MSME_CERTIFICATE plus a
// `required` boolean it already echoes per-document. Mirrors vendor/components/
// KycVerificationPanel.tsx's own DOC_TYPE_META so both sides of the KYC flow describe the same
// four document types with the same labels - not redefined differently per side.
const DOC_TYPE_LABEL: Record<KycDocType, string> = {
  PAN: "PAN card",
  GSTIN: "GST certificate",
  BANK_CHEQUE: "Cancelled cheque",
  MSME_CERTIFICATE: "MSME / Udyam certificate",
};

interface VendorKycDocumentPanelProps {
  authToken: string;
}

export function VendorKycDocumentPanel({ authToken }: VendorKycDocumentPanelProps) {
  const { selectedVendor, documents, documentsLoading, documentsError, decidingDocumentIds, decisionError, decideDocument } =
    useAdminKycStore();
  const [rejectTarget, setRejectTarget] = useState<VendorKycDocument | null>(null);
  const [justApprovedId, setJustApprovedId] = useState<number | null>(null);

  if (!selectedVendor) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-white p-16 text-center shadow-premium-card">
        <div className="flex flex-col items-center gap-3">
          <FileX size={32} className="text-brand-indigo/25" aria-hidden="true" />
          <p className="text-sm opacity-60">Select a vendor from the queue to review their documents.</p>
        </div>
      </div>
    );
  }

  async function handleApprove(doc: VendorKycDocument) {
    try {
      await decideDocument(doc.id, { approved: true }, authToken);
      // Single, non-looping pulse on the row that was just approved - per the blueprint's
      // "Approve → green pulse (150-200ms)" spec. Cleared after the animation's own duration so
      // it never re-triggers on unrelated re-renders.
      setJustApprovedId(doc.id);
      setTimeout(() => setJustApprovedId((current) => (current === doc.id ? null : current)), 200);
    } catch {
      // decisionError is already set in the store; nothing further to do here.
    }
  }

  async function handleRejectConfirm(reason: string) {
    if (!rejectTarget) return;
    await decideDocument(rejectTarget.id, { approved: false, rejectionReason: reason }, authToken);
    setRejectTarget(null);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <p className="font-display text-lg text-brand-indigo">{selectedVendor.businessName}</p>
        <p className="text-xs opacity-60">
          {selectedVendor.email} · {selectedVendor.city}, {selectedVendor.state}
        </p>
        {/* Track B Session 3 cross-link, same reasoning as DisputeDetailPanel's - reuses the id
            already on screen, no new endpoint. */}
        <Link
          to={`/admin/vendors/${selectedVendor.id}`}
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-indigo/50 hover:text-brand-indigo
            focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo rounded transition"
        >
          Manage vendor <ExternalLink size={11} aria-hidden="true" />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {documentsLoading && <p className="text-sm opacity-60">Loading documents…</p>}

        {documentsError && (
          <div
            role="alert"
            className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {documentsError}
          </div>
        )}

        {decisionError && (
          <div
            role="alert"
            className="mb-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {decisionError}
          </div>
        )}

        {!documentsLoading && !documentsError && documents.length === 0 && (
          <p className="text-sm opacity-60">This vendor hasn't uploaded any documents yet.</p>
        )}

        <ul className="space-y-3">
          {documents.map((doc) => {
            const isDeciding = decidingDocumentIds.includes(doc.id);
            const isPending = doc.status === "PENDING";
            return (
              <li
                key={doc.id}
                className={`rounded-md border border-brand-indigo/10 p-4 transition
                  ${justApprovedId === doc.id ? "motion-safe:animate-pulse-once" : ""}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-brand-indigo">
                      {DOC_TYPE_LABEL[doc.docType]}
                      {doc.required && <span className="ml-1 text-tint-chilli-text">*</span>}
                    </p>
                    <a
                      href={doc.documentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-1 inline-flex items-center gap-1 text-xs text-brand-indigo/60 hover:text-brand-indigo
                        focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo rounded transition"
                    >
                      View document <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  </div>
                  <StatusBadge status={doc.status} subtext={doc.status === "REJECTED" ? doc.rejectionReason ?? undefined : undefined} />
                </div>

                {isPending && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleApprove(doc)}
                      disabled={isDeciding}
                      className="flex min-h-11 items-center gap-2 rounded-md bg-tint-neem-border px-4 py-2 text-sm font-medium
                        text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2
                        focus-visible:ring-brand-indigo disabled:opacity-40 transition"
                    >
                      <CheckCircle2 size={16} aria-hidden="true" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setRejectTarget(doc)}
                      disabled={isDeciding}
                      className="flex min-h-11 items-center gap-2 rounded-md border border-tint-chilli-border px-4 py-2 text-sm
                        font-medium text-tint-chilli-text hover:bg-tint-chilli-bg focus-visible:ring-2
                        focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-40 transition"
                    >
                      <XCircle size={16} aria-hidden="true" />
                      Reject
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      <ConfirmReasonDialog
        open={rejectTarget !== null}
        title={`Reject ${rejectTarget ? DOC_TYPE_LABEL[rejectTarget.docType] : ""}`}
        description="This reason is shown to the vendor so they know what to fix before re-uploading."
        reasonLabel="Rejection reason"
        reasonPlaceholder="e.g. Document is blurry / doesn't match business name on file"
        confirmLabel="Reject document"
        onConfirm={handleRejectConfirm}
        onCancel={() => setRejectTarget(null)}
      />
    </div>
  );
}
