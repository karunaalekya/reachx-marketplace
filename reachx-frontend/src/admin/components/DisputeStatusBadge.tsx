import { AlertCircle, Eye, Undo2, XCircle, RefreshCcw } from "lucide-react";
import type { DisputeStatus } from "../api/adminDisputesApi";

// Same tint-token discipline as shared/components/VerificationBadgeStack.tsx (bg-tint-{variant}-
// {bg,border,text} only, no arbitrary hex) but not built on that component directly - its
// STATUS_CONFIG is typed to KycDocStatus (3 states: PENDING/APPROVED/REJECTED) and DisputeStatus
// has 5, including three distinct RESOLVED_* outcomes the KYC vocabulary has no room for.
// Widening VerificationBadgeStack's own type to a union of both domains' statuses is a real
// refactor with its own blast radius (every existing KYC call site) - out of scope for this
// session, flagged here rather than done as an unplanned side effect.
const STATUS_CONFIG: Record<
  DisputeStatus,
  { label: string; variant: "neem" | "chilli" | "saffron" | "muted"; Icon: typeof AlertCircle }
> = {
  OPEN: { label: "Open", variant: "saffron", Icon: AlertCircle },
  UNDER_REVIEW: { label: "Under review", variant: "muted", Icon: Eye },
  RESOLVED_REFUNDED: { label: "Refunded", variant: "neem", Icon: Undo2 },
  RESOLVED_REJECTED: { label: "Rejected", variant: "chilli", Icon: XCircle },
  RESOLVED_REPLACED: { label: "Replaced", variant: "neem", Icon: RefreshCcw },
};

interface DisputeStatusBadgeProps {
  status: DisputeStatus;
}

// Passive display only, same reasoning as StatusBadge in VerificationBadgeStack.tsx - no
// tabIndex/role, nothing here is clickable.
export function DisputeStatusBadge({ status }: DisputeStatusBadgeProps) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="text-sm font-medium">{label}</span>
    </span>
  );
}
