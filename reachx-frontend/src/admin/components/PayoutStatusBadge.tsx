import { Clock, Loader2, CheckCircle2, XCircle, Ban } from "lucide-react";
import type { PayoutStatus } from "../api/adminPayoutsApi";

// Same tint-token discipline as DisputeStatusBadge.tsx / VerificationBadgeStack.tsx -
// bg-tint-{variant}-{bg,border,text} only, no arbitrary hex. Not built on
// VerificationBadgeStack directly, same reasoning DisputeStatusBadge gives: a fifth status
// vocabulary (Payout.PayoutStatus) with its own real distinctions (BLOCKED vs FAILED - see
// adminPayoutsApi's own comment on vendor/api/payoutApi.ts) doesn't belong widened onto a type
// built for KYC's three states.
const STATUS_CONFIG: Record<
  PayoutStatus,
  { label: string; variant: "neem" | "chilli" | "saffron" | "muted"; Icon: typeof Clock }
> = {
  PENDING: { label: "Pending", variant: "muted", Icon: Clock },
  PROCESSING: { label: "Processing", variant: "saffron", Icon: Loader2 },
  COMPLETED: { label: "Completed", variant: "neem", Icon: CheckCircle2 },
  FAILED: { label: "Failed", variant: "chilli", Icon: XCircle },
  // BLOCKED is kept visually distinct (its own icon) from FAILED even though both use the
  // chilli tint - same real backend distinction adminPayoutsApi.ts documents (never sent to
  // the gateway at all, vs. sent and rejected/errored).
  BLOCKED: { label: "Blocked", variant: "chilli", Icon: Ban },
};

interface PayoutStatusBadgeProps {
  status: PayoutStatus;
}

// Passive display only - no tabIndex/role, nothing here is clickable.
export function PayoutStatusBadge({ status }: PayoutStatusBadgeProps) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      <Icon
        size={16}
        className={status === "PROCESSING" ? "motion-safe:animate-spin" : undefined}
        aria-hidden="true"
      />
      <span className="text-sm font-medium">{label}</span>
    </span>
  );
}
