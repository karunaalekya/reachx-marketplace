import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useAdminTaxStore } from "../store/useAdminTaxStore";
import { currentFinancialYear } from "../../vendor/api/payoutApi";

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});
const MONEY = "font-mono tabular-nums";

// Same three-FY window as VendorPayoutLedger.tsx's financialYearOptions - kept local rather than
// extracted to a shared util for this one call site, matching this codebase's existing tolerance
// for small duplication over a premature shared module (see DisputesPanel.tsx's own local
// STATUS_CONFIG, duplicated from VerificationBadgeStack's pattern rather than importing it).
function financialYearOptions(current: string): string[] {
  const [startYear] = current.split("-").map(Number);
  return [0, 1, 2].map((offset) => {
    const start = startYear - offset;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  });
}

interface AdminTaxWithholdingPanelProps {
  authToken: string;
}

export function AdminTaxWithholdingPanel({ authToken }: AdminTaxWithholdingPanelProps) {
  const { totals, financialYear, isLoading, error, lookup, setFinancialYear } = useAdminTaxStore();
  const [vendorIdInput, setVendorIdInput] = useState("");
  const fyOptions = financialYearOptions(financialYear || currentFinancialYear());

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    const id = Number(vendorIdInput);
    if (!Number.isInteger(id) || id <= 0) return;
    lookup(id, financialYear || currentFinancialYear(), authToken);
  }

  return (
    <section className="rounded-lg bg-surface-cardMuted p-6 space-y-5" aria-labelledby="admin-tax-heading">
      <header>
        <h2 id="admin-tax-heading" className="font-display text-xl text-brand-indigo">
          Tax withholding lookup
        </h2>
        <p className="text-sm opacity-70">
          View TCS/TDS totals withheld for any vendor by financial year. Scoped to this one
          confirmed admin endpoint only - see this panel's store for why there's no admin payout
          ledger here.
        </p>
      </header>

      <form onSubmit={handleLookup} className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Vendor id</span>
          <input
            type="number"
            min={1}
            required
            value={vendorIdInput}
            onChange={(e) => setVendorIdInput(e.target.value)}
            className="w-40 rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
            placeholder="e.g. 42"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-brand-indigo">Financial year</span>
          <select
            value={financialYear || currentFinancialYear()}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="rounded-md border border-brand-indigo/20 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-indigo"
          >
            {fyOptions.map((fy) => (
              <option key={fy} value={fy}>
                FY {fy}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={isLoading}
          className="flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-medium text-white transition hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo disabled:opacity-60"
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Search size={16} aria-hidden="true" />
          )}
          Look up
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {error}
        </div>
      )}

      {totals && (
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md bg-white p-4 shadow-premium-card">
            <p className="text-xs font-medium text-slate-400">TCS withheld</p>
            <p className={`mt-1 text-2xl text-brand-indigo ${MONEY}`}>{INR.format(totals.tcs)}</p>
          </div>
          <div className="rounded-md bg-white p-4 shadow-premium-card">
            <p className="text-xs font-medium text-slate-400">TDS withheld</p>
            <p className={`mt-1 text-2xl text-brand-indigo ${MONEY}`}>{INR.format(totals.tds)}</p>
          </div>
        </div>
      )}
    </section>
  );
}
