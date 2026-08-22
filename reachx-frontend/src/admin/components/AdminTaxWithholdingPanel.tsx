import { useEffect } from "react";
import { Receipt, ChevronRight } from "lucide-react";
import { useAdminTaxStore } from "../store/useAdminTaxStore";
import { financialYearOptions, type TaxType } from "../api/adminTaxApi";
import { TaxVendorRecordsPanel } from "./TaxVendorRecordsPanel";

interface AdminTaxWithholdingPanelProps {
  authToken: string;
}

const SKELETON_ROWS = 5;

const TAX_TYPE_TABS: { taxType: TaxType; label: string }[] = [
  { taxType: "TCS", label: "TCS" },
  { taxType: "TDS", label: "TDS" },
];

function formatCurrency(amount: number): string {
  // Same tabular-nums/font-mono discipline every ₹ figure in this project uses.
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Track B Session 5 (B5 Tax Withholding Reports) - the last session in the locked build order,
// per the session plan explicitly the lowest-priority / first-to-cut module. Two real endpoints:
// a per-financial-year, per-tax-type report of per-vendor summaries, and a per-vendor drill-down
// to raw per-order records (TaxVendorRecordsPanel, rendered below this list once a row is
// selected). Read-only throughout - no mutation, no ConfirmReasonDialog, no toast wiring, unlike
// every other Track B session - because neither confirmed endpoint here is a write.
export function AdminTaxWithholdingPanel({ authToken }: AdminTaxWithholdingPanelProps) {
  const {
    financialYear,
    taxType,
    report,
    reportLoading,
    reportError,
    selectedVendorId,
    fetchReport,
    setFinancialYear,
    setTaxType,
    selectVendor,
  } = useAdminTaxStore();

  useEffect(() => {
    fetchReport(authToken);
    // Runs once on mount at the store's own defaults (current FY, TCS) - re-fetching on
    // filter change is handled inside setFinancialYear/setTaxType, not duplicated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-lg bg-white shadow-premium-card">
        <div className="border-b border-brand-indigo/10 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-lg text-brand-indigo">Tax withholding reports</h2>
              <p className="text-xs opacity-60">
                {report ? `${report.length} vendor${report.length === 1 ? "" : "s"}` : "Internal ops tooling"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <label htmlFor="tax-fy-select" className="sr-only">
                Financial year
              </label>
              <select
                id="tax-fy-select"
                value={financialYear}
                onChange={(e) => setFinancialYear(e.target.value, authToken)}
                className="h-9 rounded-md border border-brand-indigo/20 px-3 text-sm outline-none
                  focus:ring-2 focus:ring-brand-indigo"
              >
                {financialYearOptions(financialYear).map((fy) => (
                  <option key={fy} value={fy}>
                    FY {fy}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* One tax type per report call - GET /tax-withholding/report/{fy}/{taxType} takes
              taxType as a path segment, not a filter, so TCS and TDS are two separate requests,
              not two columns of one response. */}
          <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Tax type">
            {TAX_TYPE_TABS.map((tab) => {
              const isActive = taxType === tab.taxType;
              return (
                <button
                  key={tab.taxType}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setTaxType(tab.taxType, authToken)}
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
          {reportLoading && (
            <ul className="space-y-3 px-6 pb-4" aria-hidden="true">
              {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <li key={i} className="h-14 animate-pulse rounded-md bg-brand-indigo/5" />
              ))}
            </ul>
          )}

          {!reportLoading && reportError && (
            <div
              role="alert"
              className="mx-6 mb-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
            >
              {reportError}
            </div>
          )}

          {!reportLoading && !reportError && report && report.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <Receipt size={28} className="text-brand-indigo/25" aria-hidden="true" />
              <p className="text-sm opacity-60">
                No {taxType} records for FY {financialYear}.
              </p>
            </div>
          )}

          {!reportLoading && !reportError && report && report.length > 0 && (
            <ul>
              {report.map((row) => {
                const isSelected = selectedVendorId === row.vendorId;
                return (
                  <li key={row.vendorId} className="border-b border-brand-indigo/5 last:border-b-0">
                    <button
                      type="button"
                      onClick={() => selectVendor(row.vendorId, row.businessName, authToken)}
                      className={`flex w-full min-h-11 items-center justify-between gap-3 px-6 py-4 text-left
                        transition focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-indigo
                        ${isSelected ? "bg-brand-indigo/5" : "hover:bg-brand-indigo/[0.03]"}`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-brand-indigo">
                          {row.businessName || `Vendor #${row.vendorId}`}
                        </p>
                        {typeof row.orderCount === "number" && (
                          <p className="text-xs opacity-60">
                            {row.orderCount} order{row.orderCount === 1 ? "" : "s"}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="tabular-nums font-mono text-sm text-brand-indigo">
                            {formatCurrency(row.taxAmount)}
                          </p>
                          {typeof row.grossAmount === "number" && (
                            <p className="text-xs tabular-nums opacity-50">
                              on {formatCurrency(row.grossAmount)}
                            </p>
                          )}
                        </div>
                        <ChevronRight
                          size={16}
                          className={`text-brand-indigo/40 transition-transform ${isSelected ? "rotate-90" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      <TaxVendorRecordsPanel authToken={authToken} />
    </div>
  );
}
