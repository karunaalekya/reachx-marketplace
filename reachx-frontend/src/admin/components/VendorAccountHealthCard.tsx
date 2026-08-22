import { Activity } from "lucide-react";
import type { AccountHealth } from "../api/adminVendorsApi";

interface VendorAccountHealthCardProps {
  health: AccountHealth | null;
  loading: boolean;
  error: string | null;
}

// Four real fields, nothing invented: overallScore + rating render as the headline, kycScore/
// fulfilmentScore/disputeScore render as three sub-score bars underneath - matches the session
// plan's explicit instruction ("all four fields are real, not invented") against a draft that
// would otherwise be tempted to add a fifth composite visual.
const SUB_SCORES: { key: keyof AccountHealth; label: string }[] = [
  { key: "kycScore", label: "KYC" },
  { key: "fulfilmentScore", label: "Fulfilment" },
  { key: "disputeScore", label: "Disputes" },
];

// Tint variant derived from the score itself, not from `rating` - `rating`'s exact casing/band
// vocabulary was never confirmed against a canonical source (see accountHealthApi.ts's own
// caution on this), so every visual decision here is driven off the numeric score, which is
// unambiguous.
function variantForScore(score: number): "neem" | "saffron" | "chilli" {
  if (score >= 75) return "neem";
  if (score >= 60) return "saffron";
  return "chilli";
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const variant = variantForScore(score);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-medium text-brand-indigo/70">{label}</span>
        <span className="tabular-nums font-mono text-brand-indigo/50">{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-brand-indigo/5">
        <div
          className={`h-full rounded-full bg-tint-${variant}-border transition-all duration-300`}
          style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
        />
      </div>
    </div>
  );
}

export function VendorAccountHealthCard({ health, loading, error }: VendorAccountHealthCardProps) {
  return (
    <div className="rounded-lg bg-white p-6 shadow-premium-card">
      <div className="mb-4 flex items-center gap-2">
        <Activity size={18} className="text-brand-indigo/40" aria-hidden="true" />
        <h3 className="font-display text-base text-brand-indigo">Account health</h3>
      </div>

      {loading && (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-10 w-24 animate-pulse rounded-md bg-brand-indigo/5" />
          <div className="space-y-3">
            {SUB_SCORES.map((s) => (
              <div key={s.key} className="h-8 animate-pulse rounded-md bg-brand-indigo/5" />
            ))}
          </div>
        </div>
      )}

      {!loading && error && (
        <div
          role="alert"
          className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {error}
        </div>
      )}

      {!loading && !error && health && (
        <>
          <div className="mb-5 flex items-baseline gap-3">
            <span
              className={`font-display text-3xl tabular-nums text-tint-${variantForScore(health.overallScore)}-text`}
            >
              {health.overallScore}
            </span>
            <span className="text-sm font-medium opacity-60">{health.rating}</span>
          </div>
          <div className="space-y-4">
            {SUB_SCORES.map((s) => (
              <ScoreBar key={s.key} label={s.label} score={health[s.key] as number} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
