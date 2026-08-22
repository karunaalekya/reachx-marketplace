import { useState } from "react";
import { Search, Loader2, CheckCircle2, XCircle, FileText } from "lucide-react";
import { useAdminKycStore } from "../store/useAdminKycStore";
import { StatusBadge } from "../../shared/components/VerificationBadgeStack";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import type { KycDocType, VendorKycDocument } from "../../vendor/api/kycApi";

const DOC_TYPE_LABEL: Record<KycDocType, string> = {
  PAN: "PAN card",
  GSTIN: "GST certificate",
  BANK_CHEQUE: "Cancelled cheque",
  MSME_CERTIFICATE: "MSME / Udyam certificate",
};

interface AdminKycQueuePanelProps {
  authToken: string;
}

export function AdminKycQueuePanel({ authToken }: AdminKycQueuePanelProps) {
  const { vendor, documents, isLoading, isDeciding, error, lookupVendor, decide } = useAdminKycStore();
  const [vendorIdInput, setVendorIdInput] = useState("");
  const [rejectingDocId, setRejectingDocId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const { toasts, pushToast, dismissToast } = useToasts();

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const id = Number(vendorIdInput);
    if (!Number.isInteger(id) || id <= 0) return;
    lookupVendor(id, authToken);
    setRejectingDocId(null);
  }

  async function handleApprove(doc: VendorKycDocument) {
    await decide(doc.id, { approved: true }, authToken);
    pushToast("neem", `${DOC_TYPE_LABEL[doc.docType]} approved`);
  }

  async function handleConfirmReject(doc: VendorKycDocument) {
    if (!rejectionReason.trim()) return;
    await decide(doc.id, { approved: false, rejectionReason: rejectionReason.trim() }, authToken);
    pushToast("chilli", `${DOC_TYPE_LABEL[doc.docType]} rejected`);
    setRejectingDocId(null);
    setRejectionReason("");
  }

  return (
    <section className="rounded-lg bg-surface-cardMuted p-6 space-y-5" aria-labelledby="admin-kyc-heading">
      <header>
        <h2 id="admin-kyc-heading" className="font-display text-xl text-brand-indigo">
          KYC decision queue
        </h2>
        <p className="text-sm opacity-70">
          Look up a vendor by id to review and decide on each of their submitted documents.
          There is no cross-vendor worklist yet - see this panel's store for why.
        </p>
      </header>

      <form onSubmit={handleLookup} className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Vendor id</span>
          <input
            type="number"
            min={1}
            required
            value={vendorIdInput}
            onChange={(e) => setVendorIdInput(e.target.value)}
            className="w-40 rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
            placeholder="e.g. 42"
          />
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Search size={16} aria-hidden="true" />
          )}
          Look up
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {error}
        </div>
      )}

      {vendor && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-md bg-white p-4 shadow-premium-card">
            <div>
              <p className="font-display text-lg text-brand-indigo">{vendor.businessName}</p>
              <p className="text-xs opacity-60">{vendor.email} · vendor #{vendor.id}</p>
            </div>
            <StatusBadge
              status={vendor.kycStatus === "PENDING" ? "PENDING" : vendor.kycStatus}
              subtext="Overall status"
            />
          </div>

          <ul className="divide-y divide-black/5 rounded-md bg-white shadow-premium-card">
            {documents.length === 0 && (
              <li className="p-6 text-center text-sm opacity-60">
                No documents uploaded by this vendor yet.
              </li>
            )}
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-start gap-3">
                  <FileText size={20} className="mt-0.5 text-brand-indigo/70" aria-hidden="true" />
                  <div>
                    <p className="text-sm font-medium">{DOC_TYPE_LABEL[doc.docType]}</p>
                    {doc.rejectionReason && (
                      <p className="mt-1 text-xs text-tint-chilli-text">{doc.rejectionReason}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={doc.status} />
                  {doc.status !== "APPROVED" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleApprove(doc)}
                        disabled={isDeciding}
                        title="Approve this document"
                        className="flex items-center gap-1.5 rounded-md border border-tint-neem-border px-3 py-1.5 text-xs font-medium text-tint-neem-text hover:bg-tint-neem-bg focus-visible:ring-2 focus-visible:ring-brand-indigo disabled:opacity-50"
                      >
                        <CheckCircle2 size={14} aria-hidden="true" />
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingDocId(rejectingDocId === doc.id ? null : doc.id)}
                        disabled={isDeciding}
                        title="Reject this document"
                        className="flex items-center gap-1.5 rounded-md border border-tint-chilli-border px-3 py-1.5 text-xs font-medium text-tint-chilli-text hover:bg-tint-chilli-bg focus-visible:ring-2 focus-visible:ring-brand-indigo disabled:opacity-50"
                      >
                        <XCircle size={14} aria-hidden="true" />
                        Reject
                      </button>
                    </>
                  )}
                </div>

                {rejectingDocId === doc.id && (
                  <div className="basis-full pt-2">
                    <label className="block">
                      <span className="mb-1 block text-xs font-medium text-brand-indigo">
                        Rejection reason (shown to the vendor)
                      </span>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        rows={2}
                        className="w-full rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
                        placeholder="e.g. GSTIN certificate photo is cropped, please re-upload the full page."
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleConfirmReject(doc)}
                      disabled={isDeciding || !rejectionReason.trim()}
                      className="mt-2 flex items-center gap-2 rounded-md bg-brand-indigo px-3 py-1.5 text-xs font-medium text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-50"
                    >
                      {isDeciding && <Loader2 size={12} className="animate-spin" aria-hidden="true" />}
                      Confirm rejection
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
