import { useEffect, useState } from "react";
import { ChevronDown, CheckCircle2, Clock3, XCircle, Ban, Loader2 } from "lucide-react";
import { usePayoutStore } from "../store/usePayoutStore";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import type { CommissionPayoutStatus, PayoutStatus } from "../api/payoutApi";

// Session 3. Real endpoints only - GET /commissions/mine (the actual gross/commission/TCS/TDS/net
// line item), GET /commissions/mine/pending-total, GET /payouts/mine (settlement status), GET
// /tax-withholding/mine/{fy} (FY tcs/tds totals). No client-side tax computation anywhere in this
// file - every ₹ figure rendered here is a number the backend returned, not derived.
//
// Deviation from the plan on record in FRONTEND_STATE.md: that plan named GET /payouts/mine as
// the ledger's data source. The real backend splits this across two resources (see payoutApi.ts
// header comment) - this component fetches both and joins by orderId. Also: no CGST/SGST/IGST
// breakdown - that field doesn't exist in this schema, only combined TCS/TDS. See payoutApi.ts
// for the full explanation; not repeating it here.

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

// tabular-nums on every rendered ₹ figure in this file - rows realign as an accordion opens/
// closes and figures update on refetch, and proportional digits would make every column jitter.
const MONEY = "font-mono tabular-nums";

const PAYOUT_STATUS_CONFIG: Record<
  PayoutStatus,
  { label: string; variant: "neem" | "chilli" | "saffron" | "muted"; Icon: typeof CheckCircle2 }
> = {
  COMPLETED: { label: "Settled", variant: "neem", Icon: CheckCircle2 },
  PROCESSING: { label: "Processing", variant: "saffron", Icon: Loader2 },
  PENDING: { label: "Pending", variant: "saffron", Icon: Clock3 },
  FAILED: { label: "Failed", variant: "chilli", Icon: XCircle },
  // Distinct from Failed on purpose - see payoutApi.ts: never sent to the gateway at all,
  // usually because payout-account onboarding isn't complete yet.
  BLOCKED: { label: "Blocked", variant: "muted", Icon: Ban },
};

const COMMISSION_STATUS_LABEL: Record<CommissionPayoutStatus, string> = {
  PENDING: "Awaiting payout",
  PAID_OUT: "Paid out",
  HELD_FOR_DISPUTE: "Held for dispute",
  CANCELLED_REFUNDED: "Cancelled / refunded",
};

function PayoutStatusBadge({ status }: { status: PayoutStatus | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5 bg-tint-muted-bg border-tint-muted-border text-tint-muted-text">
        <Clock3 size={16} aria-hidden="true" />
        <span className="text-sm font-medium">Not yet swept</span>
      </span>
    );
  }
  const { label, variant, Icon } = PAYOUT_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      <Icon size={16} aria-hidden="true" className={status === "PROCESSING" ? "animate-spin" : ""} />
      <span className="text-sm font-medium">{label}</span>
    </span>
  );
}

interface VendorPayoutLedgerProps {
  vendorId: number;
  authToken: string;
}

export function VendorPayoutLedger({ vendorId, authToken }: VendorPayoutLedgerProps) {
  const {
    pendingPayoutTotal,
    taxYear,
    taxTotals,
    isLoading,
    isLoadingTax,
    error,
    newlySettledPayouts,
    setVendorContext,
    fetchLedger,
    fetchTaxTotals,
    setTaxYear,
    clearNewlySettled,
    ledgerRows,
  } = usePayoutStore();

  const { toasts, pushToast, dismissToast } = useToasts();
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  useEffect(() => {
    setVendorContext(vendorId);
    fetchLedger(authToken);
    fetchTaxTotals(authToken);
    // Runs once per vendor identity - same pattern as KycVerificationPanel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useRefetchOnFocus(() => {
    fetchLedger(authToken);
  });

  // Fires a settlement toast once per payout that just transitioned to COMPLETED, then clears
  // the store's diff so the same toast doesn't re-fire on the next unrelated refetch.
  useEffect(() => {
    if (newlySettledPayouts.length === 0) return;
    const [first] = newlySettledPayouts;
    pushToast(
      "neem",
      "Payout settled",
      `₹${first.amount.toLocaleString("en-IN")} transferred for order #${first.orderId}`
    );
    clearNewlySettled();
  }, [newlySettledPayouts, pushToast, clearNewlySettled]);

  const rows = ledgerRows();

  return (
    <div className="space-y-6">
      {toasts.map((toast) => (
        <OperationToast key={toast.id} {...toast} onClose={dismissToast} />
      ))}

      <StaggerReveal index={1}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="rounded-lg bg-white p-5 shadow-premium-card">
            <p className="text-xs font-medium text-slate-400">Pending payout</p>
            <p className={`mt-1 text-2xl font-bold text-brand-indigo ${MONEY}`}>
              {pendingPayoutTotal === null ? "—" : INR.format(pendingPayoutTotal)}
            </p>
            <p className="mt-1 text-xs text-slate-400">Commission-record total not yet swept into a payout.</p>
          </div>

          <div className="rounded-lg bg-white p-5 shadow-premium-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-400">Tax withheld, FY {taxYear}</p>
              <select
                aria-label="Financial year"
                value={taxYear}
                onChange={(e) => {
                  setTaxYear(e.target.value);
                  fetchTaxTotals(authToken, e.target.value);
                }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-500
                  focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-indigo"
              >
                {financialYearOptions(taxYear).map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
            </div>
            {isLoadingTax ? (
              <p className="mt-1 text-sm text-slate-400">Loading…</p>
            ) : (
              <div className="mt-1 flex gap-6">
                <div>
                  <p className={`text-lg font-bold text-brand-indigo ${MONEY}`}>
                    {taxTotals ? INR.format(taxTotals.tcs) : "—"}
                  </p>
                  <p className="text-xs text-slate-400">TCS</p>
                </div>
                <div>
                  <p className={`text-lg font-bold text-brand-indigo ${MONEY}`}>
                    {taxTotals ? INR.format(taxTotals.tds) : "—"}
                  </p>
                  <p className="text-xs text-slate-400">TDS</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </StaggerReveal>

      {error && (
        <div className="rounded-md border-l-4 bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <StaggerReveal index={2}>
        <div className="rounded-lg bg-white shadow-premium-card overflow-hidden">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-bold text-brand-indigo">Payout ledger</h2>
            <p className="text-xs text-slate-400">Tap a row for the full gross → net breakdown.</p>
          </div>

          {isLoading && rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading ledger…</div>
          ) : rows.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No orders yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map(({ orderId, commission, payout }) => {
                const isExpanded = expandedOrderId === orderId;
                return (
                  <li key={orderId}>
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : orderId)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left
                        hover:bg-surface-cardMuted transition
                        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-indigo"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-indigo">Order #{orderId}</p>
                        <p className="text-xs text-slate-400">
                          {commission ? COMMISSION_STATUS_LABEL[commission.payoutStatus] : "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <p className={`text-sm font-bold text-brand-indigo ${MONEY}`}>
                          {commission ? INR.format(commission.vendorNetPayable) : "—"}
                        </p>
                        <PayoutStatusBadge status={payout?.status ?? null} />
                        <ChevronDown
                          size={18}
                          className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {isExpanded && commission && (
                      <div className="px-5 pb-5 motion-safe:animate-shell-reveal">
                        <div className="rounded-md bg-surface-cardMuted p-4 shadow-premium-dropdown">
                          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">
                            <LedgerField label="Gross amount" value={commission.grossAmount} />
                            <LedgerField
                              label={`Commission (${commission.commissionRate}%)`}
                              value={-commission.commissionAmount}
                            />
                            <LedgerField label="TCS withheld" value={-commission.tcsAmount} />
                            <LedgerField label="TDS withheld" value={-commission.tdsAmount} />
                            <LedgerField label="Net payable" value={commission.vendorNetPayable} emphasize />
                            {payout && (
                              <LedgerField label="Actually transferred" value={payout.amount} emphasize />
                            )}
                          </dl>

                          {payout?.status === "FAILED" && payout.failureReason && (
                            <p className="mt-3 text-xs text-tint-chilli-text">
                              Failure reason: {payout.failureReason}
                              {payout.retryCount > 0 && ` (retried ${payout.retryCount}×)`}
                            </p>
                          )}
                          {payout?.status === "BLOCKED" && (
                            <p className="mt-3 text-xs text-tint-muted-text">
                              Blocked - complete payout account verification to release this transfer.
                            </p>
                          )}
                          {!payout && (
                            <p className="mt-3 text-xs text-slate-400">
                              Not yet swept into a payout batch.
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </StaggerReveal>
    </div>
  );
}

function LedgerField({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: number;
  emphasize?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className={`${MONEY} ${emphasize ? "text-sm font-bold" : "text-sm font-medium"} text-brand-indigo`}>
        {INR.format(value)}
      </dd>
    </div>
  );
}

// Current FY plus the two prior - enough for a vendor to reconcile last year's filing without a
// full year picker nobody's asked for yet.
function financialYearOptions(current: string): string[] {
  const [startYear] = current.split("-").map(Number);
  return [0, 1, 2].map((offset) => {
    const start = startYear - offset;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  });
}
