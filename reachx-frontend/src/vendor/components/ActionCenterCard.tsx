import { useEffect, useState } from "react";
import { AlertTriangle, ShieldAlert, Clock3 } from "lucide-react";
import { useVendorKycStore } from "../store/useVendorStore";
import { getAccountHealth, type AccountHealth } from "../api/accountHealthApi";

interface ActionCenterCardProps {
  vendorId: number;
  businessName: string;
  authToken: string;
  onNavigateToKyc: () => void;
}

// Session 2 scope note, stated plainly rather than silently shipping two-thirds of what was
// asked for: the session plan calls for this card to pull "KYC rejections + pending disputes +
// orders awaiting dispatch, 3 real endpoints." Of those three, this session's brief confirmed
// live contracts for exactly two data sources - KYC documents (Session 1, kycApi.ts) and
// account-health (new this session, accountHealthApi.ts). No vendor-scoped "my open disputes"
// or "my orders awaiting dispatch" endpoint path was confirmed live in this session's brief -
// the only order/dispute endpoints named are POST /orders and GET /orders/{id} (single order,
// no vendor list), and no dispute endpoint at all. Guessing a path here would repeat the exact
// mistake this project already corrected once (gstEngine.ts inventing a signature for a file
// nobody had access to, per 3f). That slot below is a real, static placeholder - not a fetch
// against a made-up URL. Wire it for real in Session 4 (Orders) / Session 7 (Disputes) once
// those contracts are confirmed the same way this one was.
function healthTint(score: number): "neem" | "saffron" | "chilli" {
  if (score >= 75) return "neem";
  if (score >= 60) return "saffron";
  return "chilli";
}

const HEALTH_TINT_CLASSES = {
  neem: "bg-tint-neem-bg border-tint-neem-border text-tint-neem-text",
  saffron: "bg-tint-saffron-bg border-tint-saffron-border text-tint-saffron-text",
  chilli: "bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text",
} as const;

export function ActionCenterCard({ vendorId, businessName, authToken, onNavigateToKyc }: ActionCenterCardProps) {
  const { documents, setVendorContext, fetchKycDocuments } = useVendorKycStore();
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);

  useEffect(() => {
    // Real bug caught by src/test/App.interaction.test.tsx, fixed here rather than in the test:
    // fetchKycDocuments reads vendorId from the STORE's own state (set by setVendorContext), not
    // from this component's props - calling it without setVendorContext first silently bails
    // out with "No vendor context set" and never calls fetch(). If the vendor lands on Home
    // before ever opening the Verification tab, KycVerificationPanel's own setVendorContext
    // call hasn't run yet, so this card must set it itself rather than assuming tab visit order.
    setVendorContext(vendorId, businessName);
    fetchKycDocuments(authToken);
    getAccountHealth(vendorId, authToken)
      .then(setHealth)
      .catch((err) => setHealthError(err instanceof Error ? err.message : "Failed to load."));
    // Runs once per vendor identity, mirrors KycVerificationPanel's own mount effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  const rejectedDocs = documents.filter((d) => d.status === "REJECTED");

  return (
    <section className="rounded-lg bg-white p-6 shadow-premium-card space-y-5" aria-labelledby="action-center-heading">
      <h2 id="action-center-heading" className="font-display text-lg text-brand-indigo">
        Action Center
      </h2>

      {/* Account health - real, GET /vendors/{id}/account-health */}
      {health && (
        <div className={`flex items-center justify-between rounded-md border-l-4 px-4 py-3 ${HEALTH_TINT_CLASSES[healthTint(health.overallScore)]}`}>
          <div>
            <p className="text-sm font-semibold">Account health: {health.rating}</p>
            <p className="text-xs opacity-80">
              KYC {health.kycScore} · Fulfilment {health.fulfilmentScore} · Disputes {health.disputeScore}
            </p>
          </div>
          <span className="font-mono tabular-nums text-2xl font-bold">{health.overallScore}</span>
        </div>
      )}
      {healthError && (
        <p className="text-xs text-tint-chilli-text">Account health unavailable: {healthError}</p>
      )}

      {/* KYC rejections - real, from the shared KYC store (Session 1 kycApi.ts) */}
      {rejectedDocs.length > 0 && (
        <button
          type="button"
          onClick={onNavigateToKyc}
          className="flex w-full items-center gap-3 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-4 py-3 text-left hover:brightness-95 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
        >
          <ShieldAlert size={18} className="shrink-0 text-tint-chilli-text" aria-hidden="true" />
          <span className="text-sm text-tint-chilli-text">
            {rejectedDocs.length} verification {rejectedDocs.length === 1 ? "document needs" : "documents need"} attention
          </span>
        </button>
      )}

      {/* Orders/disputes - honestly stubbed, see comment above. Not a fetch against a guessed URL. */}
      <div className="flex items-center gap-3 rounded-md border-l-4 border-tint-muted-border bg-tint-muted-bg px-4 py-3 opacity-80">
        <Clock3 size={18} className="shrink-0 text-tint-muted-text" aria-hidden="true" />
        <span className="text-sm text-tint-muted-text">
          Open disputes and orders awaiting dispatch will appear here once those modules are wired in (Sessions 4 &amp; 7).
        </span>
      </div>

      {rejectedDocs.length === 0 && !health && !healthError && (
        <div className="flex items-center gap-3 text-sm opacity-60">
          <AlertTriangle size={16} aria-hidden="true" />
          Loading account signals…
        </div>
      )}
    </section>
  );
}
