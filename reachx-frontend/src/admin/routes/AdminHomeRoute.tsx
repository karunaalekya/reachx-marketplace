import { useOutletContext } from "react-router-dom";
import { ShieldCheck, AlertTriangle, Receipt } from "lucide-react";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { VENDOR_LIFECYCLE_ICON } from "../navConfig";

// Honest landing summary, same spirit as vendor/layouts/ModulePlaceholder.tsx - names what's
// real and built this session, and what the backend already exposes (per
// AdminConsolePlaceholder.tsx's original note on BACKEND_STATUS.md) but wasn't in this session's
// scope, rather than a decorative dashboard with numbers nothing backs.
const BUILT_CARDS = [
  { icon: ShieldCheck, label: "KYC decision queue", note: "Approve or reject a vendor's documents by vendor id." },
  { icon: AlertTriangle, label: "Dispute resolution", note: "Resolve a dispute by id with refund/replace/reject." },
  { icon: Receipt, label: "Tax withholding lookup", note: "View any vendor's TCS/TDS totals by financial year." },
];

export function AdminHomeRoute() {
  const { displayName } = useOutletContext<AdminOutletContext>();
  const VendorLifecycleIcon = VENDOR_LIFECYCLE_ICON;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-surface-cardMuted p-6">
        <h2 className="font-display text-xl text-brand-indigo">Welcome, {displayName}</h2>
        <p className="mt-1 text-sm opacity-70">
          Session 8 admin-console kickoff - three real, backend-verified-endpoint screens below.
          Each is a lookup-by-id workflow, not a cross-vendor queue - no list-all endpoint for
          pending KYC or open disputes has been confirmed anywhere in this codebase yet.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {BUILT_CARDS.map(({ icon: Icon, label, note }) => (
          <div key={label} className="rounded-lg bg-white p-5 shadow-premium-card">
            <Icon size={22} className="text-brand-indigo" aria-hidden="true" />
            <p className="mt-2 font-display text-base text-brand-indigo">{label}</p>
            <p className="mt-1 text-xs opacity-70">{note}</p>
          </div>
        ))}
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-dashed border-brand-indigo/20 p-5">
        <VendorLifecycleIcon size={22} className="mt-0.5 shrink-0 text-brand-indigo/40" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-brand-indigo">Vendor suspend / reactivate</p>
          <p className="mt-1 text-xs opacity-60">
            Not built this session - the session plan (row 8) scoped this pass to KYC decisions,
            dispute resolution, and tax lookup only. The backend endpoint was already reported
            live before this session (see the prior AdminConsolePlaceholder note); it just hasn't
            had frontend work done against it yet.
          </p>
        </div>
      </div>
    </div>
  );
}
