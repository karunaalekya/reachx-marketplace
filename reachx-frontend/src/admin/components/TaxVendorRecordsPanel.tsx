import { Receipt, X } from "lucide-react";
import { useAdminTaxStore } from "../store/useAdminTaxStore";
import { Pagination } from "../../shared/components/Pagination";

interface TaxVendorRecordsPanelProps {
  authToken: string;
}

const SKELETON_ROWS = 4;

function formatCurrency(amount: number): string {
  // Same tabular-nums/font-mono discipline every ₹ figure in this project uses.
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// Drill-down behind a report row - GET /tax-withholding/vendor/{vendorId}'s real per-order
// records, per the session plan ("raw per-order records, drill-down"). Rendered as a distinct
// panel below the summary list rather than a modal, same "no modal-per-row" convention
// VendorKycDocumentPanel's split-pane comment already established for this project. Every field
// beyond id/orderId/createdAt is rendered defensively - see adminTaxApi.ts's own comment on
// TaxWithholdingOrderRecord being this session's own B-OQ3-adjacent open question.
export function TaxVendorRecordsPanel({ authToken }: TaxVendorRecordsPanelProps) {
  const {
    selectedVendorId,
    selectedVendorName,
    vendorRecords,
    vendorRecordsLoading,
    vendorRecordsError,
    fetchVendorRecords,
    clearVendorSelection,
  } = useAdminTaxStore();

  if (selectedVendorId === null) return null;

  return (
    <div className="rounded-lg bg-white shadow-premium-card">
      <div className="flex items-center justify-between gap-3 border-b border-brand-indigo/10 px-6 py-4">
        <div>
          <h3 className="font-display text-base text-brand-indigo">
            {selectedVendorName ?? `Vendor #${selectedVendorId}`}
          </h3>
          <p className="text-xs opacity-60">
            {vendorRecords ? `${vendorRecords.totalElements} record${vendorRecords.totalElements === 1 ? "" : "s"}` : "Per-order records"}
          </p>
        </div>
        <button
          type="button"
          onClick={clearVendorSelection}
          aria-label="Close vendor records"
          className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-brand-indigo/50
            hover:bg-brand-indigo/5 hover:text-brand-indigo focus-visible:ring-2 focus-visible:ring-offset-2
            focus-visible:ring-brand-indigo transition"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>

      {vendorRecordsLoading && (
        <ul className="space-y-3 p-4" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <li key={i} className="h-12 animate-pulse rounded-md bg-brand-indigo/5" />
          ))}
        </ul>
      )}

      {!vendorRecordsLoading && vendorRecordsError && (
        <div
          role="alert"
          className="m-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {vendorRecordsError}
        </div>
      )}

      {!vendorRecordsLoading && !vendorRecordsError && vendorRecords?.empty && (
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <Receipt size={26} className="text-brand-indigo/20" aria-hidden="true" />
          <p className="text-sm opacity-60">No tax records for this vendor yet.</p>
        </div>
      )}

      {!vendorRecordsLoading && !vendorRecordsError && vendorRecords && !vendorRecords.empty && (
        <ul>
          {vendorRecords.content.map((record) => (
            <li
              key={record.id}
              className="flex items-center justify-between gap-3 border-b border-brand-indigo/5 px-6 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-brand-indigo">
                  Order #{record.orderId ?? "—"}
                </p>
                <p className="text-xs opacity-60">
                  {record.taxType ?? "—"} · {record.createdAt ? formatDate(record.createdAt) : "—"}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="tabular-nums font-mono text-sm text-brand-indigo">
                  {typeof record.amount === "number" ? formatCurrency(record.amount) : "—"}
                </p>
                {typeof record.taxableValue === "number" && (
                  <p className="text-xs tabular-nums opacity-50">
                    on {formatCurrency(record.taxableValue)}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {vendorRecords && !vendorRecords.empty && (
        <Pagination
          page={vendorRecords.number}
          totalPages={vendorRecords.totalPages}
          first={vendorRecords.first}
          last={vendorRecords.last}
          disabled={vendorRecordsLoading}
          onPageChange={(page) => fetchVendorRecords(authToken, page)}
        />
      )}
    </div>
  );
}
