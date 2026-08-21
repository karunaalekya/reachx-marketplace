import { CheckCircle2, XCircle, Clock3 } from "lucide-react";
import type { KycDocStatus } from "../../vendor/api/kycApi";

// Renders through the theme's tint tokens only (bg-tint-{variant}-bg / -border / -text) - no
// arbitrary hex classes like bg-[#EBF5F0]. Those tokens must be defined once in
// tailwind.config.js's `colors.tint` block (see design-system-reference.md) so every badge in
// the app draws from the same three-color set instead of each usage drifting its own hex pair,
// which is exactly the drift this component had before.
const STATUS_CONFIG: Record<
  KycDocStatus,
  { label: string; variant: "neem" | "chilli" | "saffron"; Icon: typeof CheckCircle2 }
> = {
  APPROVED: { label: "Approved", variant: "neem", Icon: CheckCircle2 },
  REJECTED: { label: "Rejected", variant: "chilli", Icon: XCircle },
  PENDING: { label: "Under review", variant: "saffron", Icon: Clock3 },
};

interface BadgeProps {
  status: KycDocStatus;
  subtext?: string;
}

// Passive badge: pure status display, not a button. No tabIndex, no role, no click handler -
// screen readers and keyboard navigation should skip right over it, same as any other inline
// text.
export function StatusBadge({ status, subtext }: BadgeProps) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-medium">{label}</span>
        {subtext && <span className="text-xs opacity-80">{subtext}</span>}
      </span>
    </span>
  );
}

interface InteractiveBadgeProps extends BadgeProps {
  onClick: () => void;
  actionLabel: string;
}

// Interactive variant: a rejected document whose reason a vendor can click to see. This is a
// real <button>, not a <span> with an onClick bolted on - keyboard-focusable with a visible
// focus ring, exposed to assistive tech as an actual button with actionLabel as its accessible
// name.
export function InteractiveBadge({ status, subtext, onClick, actionLabel }: InteractiveBadgeProps) {
  const { label, variant, Icon } = STATUS_CONFIG[status];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={actionLabel}
      className={`inline-flex items-center gap-2 rounded-md border-l-4 px-3 py-1.5
        bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text
        hover:brightness-95 focus-visible:ring-2 focus-visible:ring-offset-2
        focus-visible:ring-brand-indigo transition`}
    >
      <Icon size={16} aria-hidden="true" />
      <span className="flex flex-col leading-tight text-left">
        <span className="text-sm font-medium">{label}</span>
        {subtext && <span className="text-xs opacity-80">{subtext}</span>}
      </span>
    </button>
  );
}
