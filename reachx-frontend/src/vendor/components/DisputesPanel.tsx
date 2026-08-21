import { useEffect } from "react";
import { ChevronLeft, ChevronRight, MessageSquareWarning, CheckCircle2, XCircle, RefreshCw } from "lucide-react";
import { useDisputesStore } from "../store/useDisputesStore";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import type { DisputeCategory, DisputeStatus } from "../api/disputesApi";

// Checked directly against DisputeController/DisputeService/DisputeResponse - GET /disputes/mine.
// Read-only by design: a vendor doesn't raise disputes (that's the customer's action, public
// endpoint) or resolve them (ADMIN-only) - see disputesApi.ts header comment for why this file
// has no mutation calls.

const MONEY = "font-mono tabular-nums"; // used for the page indicator only, kept for consistency

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
  { label: string; variant: "neem" | "chilli" | "saffron" | "muted"; Icon: typeof MessageSquareWarning }
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

interface DisputesPanelProps {
  vendorId: number;
  authToken: string;
}

export function DisputesPanel({ vendorId, authToken }: DisputesPanelProps) {
  const { disputes, page, totalPages, isLoading, error, setVendorContext, fetchDisputes } = useDisputesStore();

  useEffect(() => {
    setVendorContext(vendorId);
    fetchDisputes(authToken, 0);
    // Runs once per vendor identity - same pattern as VendorPayoutLedger / OrdersPanel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useRefetchOnFocus(() => {
    fetchDisputes(authToken);
  });

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border-l-4 bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <StaggerReveal index={1}>
        <div className="rounded-lg bg-white shadow-premium-card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-brand-indigo">Disputes</h2>
            <p className="text-xs text-slate-400">
              Raised by customers against your orders. Only an admin can resolve a dispute.
            </p>
          </div>

          {isLoading && disputes.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading disputes…</div>
          ) : disputes.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No disputes on your orders.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {disputes.map((dispute) => (
                <li key={dispute.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-indigo">
                        Order #{dispute.orderId} · {CATEGORY_LABEL[dispute.category]}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">{dispute.description}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Raised by {dispute.raisedByEmail} ·{" "}
                        {new Date(dispute.createdAt).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <DisputeStatusBadge status={dispute.status} />
                    </div>
                  </div>

                  {dispute.resolutionNotes && (
                    <p className="mt-2 rounded-md bg-surface-cardMuted px-3 py-2 text-xs text-slate-500">
                      {dispute.resolutionNotes}
                      {dispute.resolvedAt &&
                        ` (resolved ${new Date(dispute.resolvedAt).toLocaleDateString("en-IN")})`}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fetchDisputes(authToken, page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="rounded-md p-1.5 text-slate-400 hover:bg-surface-cardMuted disabled:opacity-30
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className={`text-xs text-slate-400 ${MONEY}`}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => fetchDisputes(authToken, page + 1)}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="rounded-md p-1.5 text-slate-400 hover:bg-surface-cardMuted disabled:opacity-30
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </StaggerReveal>
    </div>
  );
}
