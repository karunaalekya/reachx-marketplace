import { useState } from "react";
import { Search, Loader2, CheckCircle2, XCircle, RefreshCw, MessageSquareWarning } from "lucide-react";
import { useAdminDisputeStore } from "../store/useAdminDisputeStore";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import type { DisputeCategory, DisputeStatus } from "../../vendor/api/disputesApi";
import type { ResolveDisputeRequest } from "../api/adminDisputesApi";

const CATEGORY_LABEL: Record<DisputeCategory, string> = {
  ITEM_NOT_RECEIVED: "Item not received",
  ITEM_DAMAGED: "Item damaged",
  ITEM_NOT_AS_DESCRIBED: "Not as described",
  WRONG_ITEM: "Wrong item",
  REFUND_REQUEST: "Refund request",
  OTHER: "Other",
};

const STATUS_CONFIG: Record<
  DisputeStatus,
  { label: string; variant: "neem" | "chilli" | "saffron"; Icon: typeof MessageSquareWarning }
> = {
  OPEN: { label: "Open", variant: "saffron", Icon: MessageSquareWarning },
  UNDER_REVIEW: { label: "Under review", variant: "saffron", Icon: RefreshCw },
  RESOLVED_REFUNDED: { label: "Resolved - refunded", variant: "neem", Icon: CheckCircle2 },
  RESOLVED_REPLACED: { label: "Resolved - replaced", variant: "neem", Icon: CheckCircle2 },
  RESOLVED_REJECTED: { label: "Resolved - rejected", variant: "chilli", Icon: XCircle },
};

function DisputeStatusBadge({ status }: { status: DisputeStatus }) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border-l-4 px-2.5 py-1 text-xs font-medium
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}

const RESOLUTION_OPTIONS: { value: ResolveDisputeRequest["status"]; label: string }[] = [
  { value: "RESOLVED_REFUNDED", label: "Refund the customer" },
  { value: "RESOLVED_REPLACED", label: "Replace the item" },
  { value: "RESOLVED_REJECTED", label: "Reject the dispute" },
];

interface AdminDisputeResolutionPanelProps {
  authToken: string;
}

export function AdminDisputeResolutionPanel({ authToken }: AdminDisputeResolutionPanelProps) {
  const { dispute, isLoading, isResolving, error, lookupDispute, resolve } = useAdminDisputeStore();
  const [disputeIdInput, setDisputeIdInput] = useState("");
  const [resolutionStatus, setResolutionStatus] = useState<ResolveDisputeRequest["status"]>(
    "RESOLVED_REFUNDED"
  );
  const [resolutionNotes, setResolutionNotes] = useState("");
  const { toasts, pushToast, dismissToast } = useToasts();

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const id = Number(disputeIdInput);
    if (!Number.isInteger(id) || id <= 0) return;
    lookupDispute(id, authToken);
    setResolutionNotes("");
  }

  async function handleResolve(e: React.FormEvent) {
    e.preventDefault();
    if (!resolutionNotes.trim()) return;
    await resolve({ status: resolutionStatus, resolutionNotes: resolutionNotes.trim() }, authToken);
    pushToast("neem", "Dispute resolved", "The vendor and customer will see the updated status.");
  }

  const isResolved = dispute?.status.startsWith("RESOLVED_") ?? false;

  return (
    <section className="rounded-lg bg-surface-cardMuted p-6 space-y-5" aria-labelledby="admin-dispute-heading">
      <header>
        <h2 id="admin-dispute-heading" className="font-display text-xl text-brand-indigo">
          Dispute resolution
        </h2>
        <p className="text-sm opacity-70">
          Look up a dispute by id to review it and record a resolution. The lookup itself relies
          on an endpoint this session couldn't independently confirm against source - see this
          panel's API file for the caveat.
        </p>
      </header>

      <form onSubmit={handleLookup} className="flex items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Dispute id</span>
          <input
            type="number"
            min={1}
            required
            value={disputeIdInput}
            onChange={(e) => setDisputeIdInput(e.target.value)}
            className="w-40 rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
            placeholder="e.g. 17"
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

      {dispute && (
        <div className="space-y-4 rounded-md bg-white p-4 shadow-premium-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium">
                Order #{dispute.orderId} · {CATEGORY_LABEL[dispute.category]}
              </p>
              <p className="mt-1 text-sm opacity-80">{dispute.description}</p>
              <p className="mt-2 text-xs opacity-50">Raised by {dispute.raisedByEmail}</p>
            </div>
            <DisputeStatusBadge status={dispute.status} />
          </div>

          {dispute.resolutionNotes && (
            <div className="rounded-md bg-surface-cardMuted px-3 py-2 text-xs">
              <span className="font-medium text-brand-indigo">Resolution notes: </span>
              {dispute.resolutionNotes}
            </div>
          )}

          {!isResolved && (
            <form onSubmit={handleResolve} className="space-y-3 border-t border-black/5 pt-4">
              <fieldset>
                <legend className="mb-2 text-xs font-medium text-brand-indigo">Resolution</legend>
                <div className="flex flex-wrap gap-2">
                  {RESOLUTION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition
                        ${resolutionStatus === opt.value
                          ? "border-brand-indigo bg-brand-indigo/10 text-brand-indigo"
                          : "border-brand-indigo/20 text-brand-indigo/70 hover:bg-brand-indigo/5"}`}
                    >
                      <input
                        type="radio"
                        name="resolutionStatus"
                        value={opt.value}
                        checked={resolutionStatus === opt.value}
                        onChange={() => setResolutionStatus(opt.value)}
                        className="sr-only"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </fieldset>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-brand-indigo">
                  Resolution notes (shown to the vendor and customer)
                </span>
                <textarea
                  value={resolutionNotes}
                  onChange={(e) => setResolutionNotes(e.target.value)}
                  rows={3}
                  required
                  className="w-full rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
                  placeholder="e.g. Refund approved - photo evidence confirms item arrived damaged."
                />
              </label>

              <button
                type="submit"
                disabled={isResolving || !resolutionNotes.trim()}
                className="flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-medium text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-50"
              >
                {isResolving && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                Confirm resolution
              </button>
            </form>
          )}
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
