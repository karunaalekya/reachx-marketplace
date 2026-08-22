import { useState } from "react";
import { Link } from "react-router-dom";
import { FileX, Undo2, XCircle, RefreshCcw, ExternalLink } from "lucide-react";
import { useAdminDisputesStore } from "../store/useAdminDisputesStore";
import { DisputeStatusBadge } from "./DisputeStatusBadge";
import { ConfirmReasonDialog } from "../../shared/components/ConfirmReasonDialog";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import type { DisputeResolution } from "../api/adminDisputesApi";

const CATEGORY_LABEL: Record<string, string> = {
  ITEM_NOT_RECEIVED: "Item not received",
  ITEM_DAMAGED: "Item damaged",
  ITEM_NOT_AS_DESCRIBED: "Item not as described",
  WRONG_ITEM: "Wrong item",
  REFUND_REQUEST: "Refund request",
  OTHER: "Other",
};

// One action per real ResolveDisputeRequest.resolution value - no refund-amount input anywhere
// here (see adminDisputesApi.ts: the backend has no such field and derives the amount itself).
// Each opens the same shared ConfirmReasonDialog with the notes field relabeled per outcome,
// rather than a bespoke dialog per resolution - session plan reuses Session 1's one standardized
// confirmation-dialog component.
const RESOLUTION_ACTIONS: {
  resolution: DisputeResolution;
  label: string;
  Icon: typeof Undo2;
  dialogTitle: string;
  dialogDescription: string;
}[] = [
  {
    resolution: "RESOLVED_REFUNDED",
    label: "Refund",
    Icon: Undo2,
    dialogTitle: "Resolve as refunded",
    dialogDescription:
      "The backend processes the refund itself once this is confirmed - there's no amount to enter here.",
  },
  {
    resolution: "RESOLVED_REJECTED",
    label: "Reject claim",
    Icon: XCircle,
    dialogTitle: "Resolve as rejected",
    dialogDescription: "The vendor's held payout for this order is released once this is confirmed.",
  },
  {
    resolution: "RESOLVED_REPLACED",
    label: "Replace",
    Icon: RefreshCcw,
    dialogTitle: "Resolve as replaced",
    dialogDescription: "Vendor payout for this order stays held pending manual reconciliation.",
  },
];

interface DisputeDetailPanelProps {
  authToken: string;
}

export function DisputeDetailPanel({ authToken }: DisputeDetailPanelProps) {
  const { selectedDispute, resolving, resolutionError, resolve } = useAdminDisputesStore();
  const [pendingAction, setPendingAction] = useState<(typeof RESOLUTION_ACTIONS)[number] | null>(null);
  const { toasts, pushToast, dismissToast } = useToasts();

  if (!selectedDispute) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg bg-white p-16 text-center shadow-premium-card">
        <div className="flex flex-col items-center gap-3">
          <FileX size={32} className="text-brand-indigo/25" aria-hidden="true" />
          <p className="text-sm opacity-60">Select a dispute from the queue to review it.</p>
        </div>
      </div>
    );
  }

  const isResolved = selectedDispute.status.startsWith("RESOLVED");
  // Captured as a local const right after the null guard - TS doesn't carry the narrowing from
  // the early return above into a nested closure defined further down (selectedDispute is a
  // destructured store field, not a plain local), so handleConfirm below reads this instead of
  // the store field directly.
  const disputeId = selectedDispute.id;

  async function handleConfirm(notes: string) {
    if (!pendingAction) return;
    const actionLabel = pendingAction.label;
    // No try/catch here - same pattern as VendorKycDocumentPanel's handleRejectConfirm. On
    // failure, resolve() re-throws and ConfirmReasonDialog's own handler catches it, shows the
    // real backend message (e.g. "This dispute has already been resolved") inline in the dialog,
    // and keeps it open for retry - a toast on top of that would just duplicate the message.
    await resolve(pendingAction.resolution, notes, authToken);
    pushToast("neem", `Dispute #${disputeId} resolved`, actionLabel);
    setPendingAction(null);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-display text-lg text-brand-indigo">
              Order #{selectedDispute.orderId} · Vendor #{selectedDispute.vendorId}
            </p>
            <p className="text-xs opacity-60">{selectedDispute.raisedByEmail}</p>
            {/* Track B Session 3 cross-link: this dispute's vendor now has a real detail page
                to jump to (Vendor Management, built this session) - no new endpoint added, just
                a route the id was already sitting right here for. */}
            <Link
              to={`/admin/vendors/${selectedDispute.vendorId}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-brand-indigo/50 hover:text-brand-indigo
                focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo rounded transition"
            >
              Manage vendor <ExternalLink size={11} aria-hidden="true" />
            </Link>
          </div>
          <DisputeStatusBadge status={selectedDispute.status} />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <dl className="space-y-4 text-sm">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide opacity-50">Category</dt>
            <dd className="mt-0.5 text-brand-indigo">{CATEGORY_LABEL[selectedDispute.category]}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide opacity-50">Description</dt>
            <dd className="mt-0.5 whitespace-pre-wrap text-brand-indigo">{selectedDispute.description}</dd>
          </div>
          {isResolved && selectedDispute.resolutionNotes && (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide opacity-50">Resolution notes</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-brand-indigo">{selectedDispute.resolutionNotes}</dd>
            </div>
          )}
        </dl>

        {resolutionError && (
          <div
            role="alert"
            className="mt-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {resolutionError}
          </div>
        )}

        {isResolved ? (
          <p className="mt-6 text-xs opacity-50">
            This dispute has already been resolved - the backend rejects a second resolution attempt.
          </p>
        ) : (
          <div className="mt-6 flex flex-wrap gap-2">
            {RESOLUTION_ACTIONS.map((action) => (
              <button
                key={action.resolution}
                type="button"
                onClick={() => setPendingAction(action)}
                disabled={resolving}
                className="flex min-h-11 items-center gap-2 rounded-md border border-brand-indigo/20 px-4 py-2 text-sm
                  font-medium text-brand-indigo hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2
                  focus-visible:ring-brand-indigo disabled:opacity-40 transition"
              >
                <action.Icon size={16} aria-hidden="true" />
                {action.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <ConfirmReasonDialog
        open={pendingAction !== null}
        title={pendingAction?.dialogTitle ?? ""}
        description={pendingAction?.dialogDescription}
        reasonLabel="Resolution notes"
        reasonPlaceholder="What happened and what was decided"
        confirmLabel={pendingAction ? pendingAction.label : "Confirm"}
        onConfirm={handleConfirm}
        onCancel={() => setPendingAction(null)}
      />

      {toasts.map((toast) => (
        <OperationToast key={toast.id} {...toast} onClose={dismissToast} />
      ))}
    </div>
  );
}
