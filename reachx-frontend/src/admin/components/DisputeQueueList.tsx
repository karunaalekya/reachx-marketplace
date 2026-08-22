import { useEffect } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useAdminDisputesStore } from "../store/useAdminDisputesStore";
import { Pagination } from "../../shared/components/Pagination";
import type { Dispute, DisputeStatus } from "../api/adminDisputesApi";

interface DisputeQueueListProps {
  authToken: string;
}

// One tab per real DisputeStatus value - matches DisputeController#byStatus taking exactly one
// status at a time (no "ALL" query support server-side, see adminDisputesApi.ts), so the filter
// UI doesn't offer a combined view the backend can't actually serve. OPEN first and selected by
// default, matching the backend's own @RequestParam(defaultValue = "OPEN").
const STATUS_TABS: { status: DisputeStatus; label: string }[] = [
  { status: "OPEN", label: "Open" },
  { status: "UNDER_REVIEW", label: "Under review" },
  { status: "RESOLVED_REFUNDED", label: "Refunded" },
  { status: "RESOLVED_REJECTED", label: "Rejected" },
  { status: "RESOLVED_REPLACED", label: "Replaced" },
];

const SKELETON_ROWS = 6;

const CATEGORY_LABEL: Record<Dispute["category"], string> = {
  ITEM_NOT_RECEIVED: "Item not received",
  ITEM_DAMAGED: "Item damaged",
  ITEM_NOT_AS_DESCRIBED: "Item not as described",
  WRONG_ITEM: "Wrong item",
  REFUND_REQUEST: "Refund request",
  OTHER: "Other",
};

export function DisputeQueueList({ authToken }: DisputeQueueListProps) {
  const {
    statusFilter,
    disputes,
    disputesLoading,
    disputesError,
    selectedDispute,
    fetchDisputes,
    setStatusFilter,
    selectDispute,
  } = useAdminDisputesStore();

  useEffect(() => {
    fetchDisputes(authToken, "OPEN", 0);
    // Runs once on mount at the backend's own default (OPEN) - re-fetching after a resolve is
    // handled inside the store's own resolve action, not duplicated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-full flex-col rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <h2 className="font-display text-lg text-brand-indigo">Disputes</h2>
        {disputes && (
          <p className="text-xs opacity-60">
            {disputes.totalElements} dispute{disputes.totalElements === 1 ? "" : "s"}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const isActive = statusFilter === tab.status;
            return (
              <button
                key={tab.status}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setStatusFilter(tab.status, authToken)}
                className={`min-h-9 rounded-md px-3 py-1.5 text-xs font-medium transition
                  focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo
                  ${isActive
                    ? "bg-brand-indigo text-white"
                    : "bg-brand-indigo/5 text-brand-indigo/70 hover:bg-brand-indigo/10"}`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {disputesLoading && (
          <ul className="space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-md bg-brand-indigo/5" />
            ))}
          </ul>
        )}

        {disputesError && (
          <div
            role="alert"
            className="m-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {disputesError}
          </div>
        )}

        {!disputesLoading && !disputesError && disputes?.empty && statusFilter === "OPEN" && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <CheckCircle2 size={28} className="text-tint-neem-border" aria-hidden="true" />
            <p className="text-sm opacity-60">No open disputes.</p>
          </div>
        )}

        {!disputesLoading && !disputesError && disputes?.empty && statusFilter !== "OPEN" && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <p className="text-sm opacity-60">Nothing in this status yet.</p>
          </div>
        )}

        {!disputesLoading && !disputesError && disputes && !disputes.empty && (
          <ul>
            {disputes.content.map((dispute) => {
              const isSelected = selectedDispute?.id === dispute.id;
              return (
                <li key={dispute.id}>
                  <button
                    type="button"
                    onClick={() => selectDispute(dispute)}
                    aria-current={isSelected ? "true" : undefined}
                    className={`flex w-full items-start gap-3 border-b border-brand-indigo/5 px-6 py-4 text-left transition
                      focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-indigo
                      ${isSelected ? "bg-brand-indigo/10" : "hover:bg-brand-indigo/5"}`}
                  >
                    <AlertTriangle
                      size={18}
                      className={`mt-0.5 shrink-0 ${isSelected ? "text-brand-indigo" : "text-brand-indigo/30"}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-indigo">
                        Order #{dispute.orderId} · {CATEGORY_LABEL[dispute.category]}
                      </p>
                      <p className="truncate text-xs opacity-60">{dispute.raisedByEmail}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {disputes && !disputes.empty && (
        <Pagination
          page={disputes.number}
          totalPages={disputes.totalPages}
          first={disputes.first}
          last={disputes.last}
          disabled={disputesLoading}
          onPageChange={(page) => fetchDisputes(authToken, statusFilter, page)}
        />
      )}
    </div>
  );
}
