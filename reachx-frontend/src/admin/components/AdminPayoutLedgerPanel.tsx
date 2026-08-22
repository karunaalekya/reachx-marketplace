import { useEffect, useState } from "react";
import { Wallet, RefreshCcw, Loader2, X } from "lucide-react";
import { useAdminPayoutsStore } from "../store/useAdminPayoutsStore";
import { PayoutStatusBadge } from "./PayoutStatusBadge";
import { Pagination } from "../../shared/components/Pagination";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import type { PayoutRecord, PayoutStatus } from "../api/adminPayoutsApi";

interface AdminPayoutLedgerPanelProps {
  authToken: string;
}

const SKELETON_ROWS = 6;

// One tab per real Payout.PayoutStatus value, plus "All" - GET /payouts?status=X takes status
// as a genuinely optional filter (see adminPayoutsApi.ts), unlike disputes' required one, so an
// unfiltered view is real and offered here, not invented.
const STATUS_TABS: { status: PayoutStatus | undefined; label: string }[] = [
  { status: undefined, label: "All" },
  { status: "PENDING", label: "Pending" },
  { status: "PROCESSING", label: "Processing" },
  { status: "COMPLETED", label: "Completed" },
  { status: "FAILED", label: "Failed" },
  { status: "BLOCKED", label: "Blocked" },
];

function formatCurrency(amount: number): string {
  // Same tabular-nums/font-mono discipline every ₹ figure in this project uses.
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function isRetryable(status: PayoutStatus): boolean {
  // Matches PayoutService.retry()'s real guard exactly: only FAILED or BLOCKED payouts can be
  // retried - see the component's own comment above for why this isn't FAILED-only.
  return status === "FAILED" || status === "BLOCKED";
}

// Track B Session 4 (B4 Payout Ops). Global ledger (all vendors, filterable by status) with an
// optional vendor-id scope down to GET /payouts/vendor/{id} - the session plan calls out both
// endpoints, and the vendor-id input is the one bit of UI needed to reach the second without a
// separate screen. Stacked-list rows, not a horizontal-scrolling table - same convention every
// other admin list in this project uses (VendorInvoiceList.tsx, DisputeQueueList.tsx), which
// already reads fine at both mobile and desktop widths without a separate breakpoint decision.
//
// CORRECTION vs. the session plan's prose ("Retry button visible only on FAILED rows"): checked
// directly against the real PayoutService.retry() source this session -
// `if (payout.getStatus() != FAILED && payout.getStatus() != BLOCKED) throw new
// IllegalStateException(...)`. BLOCKED (vendor has no verified payout account yet / account
// isn't VERIFIED) is retryable too, not just FAILED - retrying re-runs the same netting +
// gateway-call path, so a BLOCKED payout correctly succeeds once the vendor's payout account
// gets verified in the meantime. Gating the button to FAILED only, as the session plan's prose
// said, would silently hide a real, backend-supported recovery path for BLOCKED payouts. The
// source is the actual contract here, not the plan prose - same discipline this project's own
// FRONTEND_STATE.md documents for every other prose-vs-source conflict it found.
export function AdminPayoutLedgerPanel({ authToken }: AdminPayoutLedgerPanelProps) {
  const {
    statusFilter,
    vendorIdFilter,
    payouts,
    payoutsLoading,
    payoutsError,
    retryingIds,
    retryErrors,
    fetchPayouts,
    setStatusFilter,
    setVendorIdFilter,
    retry,
  } = useAdminPayoutsStore();

  const [vendorIdInput, setVendorIdInput] = useState("");
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    fetchPayouts(authToken, 0);
    // Runs once on mount at the store's own default (no status filter, no vendor scope) -
    // re-fetching after a retry is handled inside the store's own retry action, not
    // duplicated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleVendorFilterSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = vendorIdInput.trim();
    if (!trimmed) return;
    const parsed = Number(trimmed);
    if (!Number.isInteger(parsed) || parsed <= 0) return;
    setVendorIdFilter(parsed, authToken);
  }

  function clearVendorFilter() {
    setVendorIdInput("");
    setVendorIdFilter(null, authToken);
  }

  async function handleRetry(payout: PayoutRecord) {
    try {
      await retry(payout.id, authToken);
      const refreshed = useAdminPayoutsStore
        .getState()
        .payouts?.content.find((p) => p.id === payout.id);
      if (refreshed && isRetryable(refreshed.status)) {
        pushToast("chilli", `Retry for payout #${payout.id} did not succeed`, refreshed.failureReason ?? undefined);
      } else {
        pushToast("neem", `Retry submitted for payout #${payout.id}`, refreshed ? `Now ${refreshed.status.toLowerCase()}` : undefined);
      }
    } catch {
      // The row-level error banner (retryErrors[id]) already carries the real message - a
      // toast on top of that would just duplicate it, same reasoning DisputeDetailPanel gives
      // for its own resolve failures.
    }
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg text-brand-indigo">Payouts</h2>
            {payouts && (
              <p className="text-xs opacity-60">
                {payouts.totalElements} payout{payouts.totalElements === 1 ? "" : "s"}
                {vendorIdFilter ? ` · Vendor #${vendorIdFilter}` : ""}
              </p>
            )}
          </div>

          <form onSubmit={handleVendorFilterSubmit} className="flex items-center gap-2">
            <label htmlFor="payout-vendor-filter" className="sr-only">
              Filter by vendor ID
            </label>
            <input
              id="payout-vendor-filter"
              type="text"
              inputMode="numeric"
              placeholder="Filter by vendor ID"
              value={vendorIdInput}
              onChange={(e) => setVendorIdInput(e.target.value)}
              className="h-9 w-40 rounded-md border border-brand-indigo/20 px-3 text-sm outline-none
                focus:ring-2 focus:ring-brand-indigo"
            />
            <button
              type="submit"
              className="min-h-9 rounded-md bg-brand-indigo/5 px-3 text-sm font-medium text-brand-indigo/70
                hover:bg-brand-indigo/10 focus-visible:ring-2 focus-visible:ring-offset-2
                focus-visible:ring-brand-indigo transition"
            >
              Apply
            </button>
            {vendorIdFilter && (
              <button
                type="button"
                onClick={clearVendorFilter}
                aria-label="Clear vendor filter"
                className="flex min-h-9 min-w-9 items-center justify-center rounded-md text-brand-indigo/50
                  hover:bg-brand-indigo/5 hover:text-brand-indigo focus-visible:ring-2 focus-visible:ring-offset-2
                  focus-visible:ring-brand-indigo transition"
              >
                <X size={16} aria-hidden="true" />
              </button>
            )}
          </form>
        </div>

        {/* Status tabs only apply to the global ledger - GET /payouts/vendor/{id} has no
            status query param in the session plan, so filtering by status while vendor-scoped
            isn't a real backend capability. Selecting a status tab clears the vendor scope
            (see the store's setStatusFilter). */}
        <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Filter by status">
          {STATUS_TABS.map((tab) => {
            const isActive = !vendorIdFilter && statusFilter === tab.status;
            return (
              <button
                key={tab.label}
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

      <div className="min-h-[16rem]">
        {payoutsLoading && (
          <ul className="space-y-3 px-6 pb-4" aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-md bg-brand-indigo/5" />
            ))}
          </ul>
        )}

        {!payoutsLoading && payoutsError && (
          <div
            role="alert"
            className="mx-6 mb-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {payoutsError}
          </div>
        )}

        {!payoutsLoading && !payoutsError && payouts?.empty && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Wallet size={28} className="text-brand-indigo/25" aria-hidden="true" />
            <p className="text-sm opacity-60">
              {vendorIdFilter ? "No payouts for this vendor yet." : "No payouts match this filter."}
            </p>
          </div>
        )}

        {!payoutsLoading && !payoutsError && payouts && !payouts.empty && (
          <ul>
            {payouts.content.map((payout) => {
              const isRetrying = retryingIds.includes(payout.id);
              const retryError = retryErrors[payout.id];
              return (
                <li
                  key={payout.id}
                  className="border-b border-brand-indigo/5 px-6 py-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-brand-indigo">
                        Order #{payout.orderId} · Vendor #{payout.vendorId}
                      </p>
                      <p className="text-xs opacity-60">
                        {payout.gateway}
                        {payout.gatewayTransferId ? ` · ${payout.gatewayTransferId}` : ""}
                        {" · "}
                        Initiated {formatDate(payout.initiatedAt)}
                        {payout.completedAt ? ` · Completed ${formatDate(payout.completedAt)}` : ""}
                      </p>
                      {payout.retryCount > 0 && (
                        <p className="text-xs opacity-50">Retried {payout.retryCount}×</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums font-mono text-sm text-brand-indigo">
                        {formatCurrency(payout.amount)}
                      </span>
                      <PayoutStatusBadge status={payout.status} />
                      {isRetryable(payout.status) && (
                        <button
                          type="button"
                          onClick={() => handleRetry(payout)}
                          disabled={isRetrying}
                          className="flex min-h-11 items-center gap-2 rounded-md bg-brand-saffron px-4 py-2
                            text-sm font-medium text-white hover:brightness-110 focus-visible:ring-2
                            focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-50 transition"
                        >
                          {isRetrying ? (
                            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                          ) : (
                            <RefreshCcw size={16} aria-hidden="true" />
                          )}
                          {isRetrying ? "Retrying…" : "Retry"}
                        </button>
                      )}
                    </div>
                  </div>

                  {isRetryable(payout.status) && payout.failureReason && (
                    <p className="mt-2 text-xs text-tint-chilli-text">{payout.failureReason}</p>
                  )}

                  {retryError && (
                    <div
                      role="alert"
                      className="mt-2 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-xs text-tint-chilli-text"
                    >
                      {retryError}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {payouts && !payouts.empty && (
        <Pagination
          page={payouts.number}
          totalPages={payouts.totalPages}
          first={payouts.first}
          last={payouts.last}
          disabled={payoutsLoading}
          onPageChange={(page) => fetchPayouts(authToken, page)}
        />
      )}

      {toasts.map((toast) => (
        <OperationToast key={toast.id} {...toast} onClose={dismissToast} />
      ))}
    </div>
  );
}
