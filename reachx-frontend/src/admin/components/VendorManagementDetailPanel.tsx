import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Ban,
  RotateCcw,
  Percent,
  Loader2,
  CheckCircle2,
  BadgeCheck,
  ShieldAlert,
} from "lucide-react";
import { useAdminVendorStore } from "../store/useAdminVendorStore";
import { ConfirmReasonDialog } from "../../shared/components/ConfirmReasonDialog";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import { VendorAccountHealthCard } from "./VendorAccountHealthCard";
import { VendorInvoiceList } from "./VendorInvoiceList";
import type { VendorAccountStatus } from "../api/adminKycApi";

interface VendorManagementDetailPanelProps {
  vendorId: number;
  authToken: string;
}

const STATUS_META: Record<
  VendorAccountStatus,
  { label: string; variant: "neem" | "chilli" | "muted"; Icon: typeof CheckCircle2 }
> = {
  ACTIVE: { label: "Active", variant: "neem", Icon: CheckCircle2 },
  SUSPENDED: { label: "Suspended", variant: "chilli", Icon: ShieldAlert },
  INACTIVE: { label: "Inactive", variant: "muted", Icon: BadgeCheck },
};

// Only the real, backend-confirmed controls per the session plan: commission rate, suspend,
// reactivate. No edit-email/edit-address/edit-KYC-status anywhere here - the plan is explicit
// that nothing exposes those, and this page doesn't invent controls for endpoints that don't
// exist.
export function VendorManagementDetailPanel({ vendorId, authToken }: VendorManagementDetailPanelProps) {
  const {
    vendor,
    vendorLoading,
    vendorError,
    health,
    healthLoading,
    healthError,
    loadVendor,
    setCommissionRate,
    updatingCommission,
    commissionError,
    suspend,
    reactivate,
    updatingStatus,
    statusError,
  } = useAdminVendorStore();

  const [suspendDialogOpen, setSuspendDialogOpen] = useState(false);
  const [commissionDraft, setCommissionDraft] = useState("");
  const { toasts, pushToast, dismissToast } = useToasts();

  useEffect(() => {
    loadVendor(vendorId, authToken);
    // Re-runs only if the vendor id itself changes (a fresh lookup) - not on every authToken
    // identity change, which would refire on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    if (vendor) setCommissionDraft(String(vendor.commissionRate));
  }, [vendor?.commissionRate]);

  if (vendorLoading) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <div className="h-24 animate-pulse rounded-lg bg-brand-indigo/5" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-lg bg-brand-indigo/5" />
          <div className="h-48 animate-pulse rounded-lg bg-brand-indigo/5" />
        </div>
      </div>
    );
  }

  if (vendorError || !vendor) {
    return (
      <div
        role="alert"
        className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-4 py-3 text-sm text-tint-chilli-text"
      >
        {vendorError ?? "Vendor not found."}
      </div>
    );
  }

  // Captured as a local const right after the null guard - TS doesn't carry the narrowing from
  // the early return above into the nested handler closures below (vendor is a destructured
  // store field, not a plain local), same pattern DisputeDetailPanel.tsx already uses for
  // selectedDispute/disputeId.
  const currentVendor = vendor;
  const statusMeta = STATUS_META[currentVendor.status];
  const commissionChanged = commissionDraft.trim() !== "" && Number(commissionDraft) !== vendor.commissionRate;
  const commissionValid =
    commissionDraft.trim() !== "" && !Number.isNaN(Number(commissionDraft)) && Number(commissionDraft) >= 0 && Number(commissionDraft) <= 100;

  async function handleSaveCommission() {
    if (!commissionValid || !commissionChanged || updatingCommission) return;
    try {
      await setCommissionRate(Number(commissionDraft), authToken);
      pushToast("neem", "Commission rate updated", `${commissionDraft}% for ${currentVendor.businessName}`);
    } catch {
      // commissionError is already set in the store - no further action needed here.
    }
  }

  async function handleSuspendConfirm(reason: string) {
    await suspend(reason, authToken);
    pushToast("chilli", "Vendor suspended", currentVendor.businessName);
    setSuspendDialogOpen(false);
  }

  async function handleReactivate() {
    try {
      await reactivate(authToken);
      pushToast("neem", "Vendor reactivated", currentVendor.businessName);
    } catch {
      // statusError is already set in the store.
    }
  }

  return (
    <div className="space-y-6">
      {/* Vendor summary card */}
      <div className="rounded-lg bg-white p-6 shadow-premium-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-display text-xl text-brand-indigo">{vendor.businessName}</p>
            <p className="mt-0.5 text-sm opacity-60">
              {vendor.email} · {vendor.phone}
            </p>
            <p className="mt-0.5 text-sm opacity-60">
              {vendor.addressLine1}
              {vendor.addressLine2 ? `, ${vendor.addressLine2}` : ""}, {vendor.city}, {vendor.state}{" "}
              {vendor.pincode}
            </p>
          </div>
          <span
            className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
              bg-tint-${statusMeta.variant}-bg border-tint-${statusMeta.variant}-border text-tint-${statusMeta.variant}-text`}
          >
            <statusMeta.Icon size={16} aria-hidden="true" />
            <span className="text-sm font-medium">{statusMeta.label}</span>
          </span>
        </div>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-xs opacity-70">
          <div>
            <dt className="inline font-medium">KYC status: </dt>
            <dd className="inline">{vendor.kycStatus}</dd>
          </div>
          <div>
            <dt className="inline font-medium">PAN on file: </dt>
            <dd className="inline">{vendor.panOnFile ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Email verified: </dt>
            <dd className="inline">{vendor.emailVerified ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="inline font-medium">Vendor ID: </dt>
            <dd className="inline tabular-nums">{vendor.id}</dd>
          </div>
        </dl>

        {statusError && (
          <div
            role="alert"
            className="mt-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
          >
            {statusError}
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-end gap-6">
          {/* Commission rate editor */}
          <label className="block">
            <span className="mb-1 flex items-center gap-1 text-xs font-medium text-brand-indigo">
              <Percent size={12} aria-hidden="true" />
              Commission rate
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={commissionDraft}
                onChange={(e) => setCommissionDraft(e.target.value)}
                disabled={updatingCommission}
                aria-label="Commission rate percent"
                className="w-24 rounded-md border border-brand-indigo/20 px-3 py-2 text-sm tabular-nums outline-none
                  focus:ring-2 focus:ring-brand-indigo disabled:opacity-60"
              />
              <button
                type="button"
                onClick={handleSaveCommission}
                disabled={!commissionValid || !commissionChanged || updatingCommission}
                className="flex min-h-11 items-center gap-2 rounded-md bg-brand-saffron px-4 py-2 text-sm font-medium
                  text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2
                  focus-visible:ring-brand-indigo disabled:opacity-40 transition"
              >
                {updatingCommission && <Loader2 size={16} className="animate-spin" aria-hidden="true" />}
                {updatingCommission ? "Saving…" : "Save"}
              </button>
            </div>
            {commissionError && <p className="mt-1 text-xs text-tint-chilli-text">{commissionError}</p>}
          </label>

          {/* Suspend / Reactivate - exactly one shown at a time per vendor.status, never both. */}
          {vendor.status === "SUSPENDED" ? (
            <button
              type="button"
              onClick={handleReactivate}
              disabled={updatingStatus}
              className="flex min-h-11 items-center gap-2 rounded-md bg-tint-neem-border px-4 py-2 text-sm font-medium
                text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2
                focus-visible:ring-brand-indigo disabled:opacity-40 transition"
            >
              {updatingStatus ? (
                <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              ) : (
                <RotateCcw size={16} aria-hidden="true" />
              )}
              {updatingStatus ? "Processing…" : "Reactivate vendor"}
            </button>
          ) : vendor.status === "ACTIVE" ? (
            <button
              type="button"
              onClick={() => setSuspendDialogOpen(true)}
              disabled={updatingStatus}
              className="flex min-h-11 items-center gap-2 rounded-md border border-tint-chilli-border px-4 py-2 text-sm
                font-medium text-tint-chilli-text hover:bg-tint-chilli-bg focus-visible:ring-2
                focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-40 transition"
            >
              <Ban size={16} aria-hidden="true" />
              Suspend vendor
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <VendorAccountHealthCard health={health} loading={healthLoading} error={healthError} />
        <VendorInvoiceList authToken={authToken} />
      </div>

      <ConfirmReasonDialog
        open={suspendDialogOpen}
        title={`Suspend ${vendor.businessName}?`}
        description="This takes the vendor's storefront down immediately. A reason is required and shown in the vendor's account activity."
        reasonLabel="Suspension reason"
        reasonPlaceholder="e.g. Repeated fulfilment SLA breaches"
        confirmLabel="Suspend vendor"
        onConfirm={handleSuspendConfirm}
        onCancel={() => setSuspendDialogOpen(false)}
      />

      {toasts.map((toast) => (
        <OperationToast key={toast.id} {...toast} onClose={dismissToast} />
      ))}

      <Link
        to="/admin/vendors"
        className="inline-block text-xs font-medium text-brand-indigo/60 hover:text-brand-indigo
          focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo rounded transition"
      >
        ← Look up another vendor
      </Link>
    </div>
  );
}
