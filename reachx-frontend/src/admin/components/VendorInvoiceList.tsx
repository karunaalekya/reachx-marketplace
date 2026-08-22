import { FileText, Download, Loader2 } from "lucide-react";
import { useAdminVendorStore } from "../store/useAdminVendorStore";
import { Pagination } from "../../shared/components/Pagination";

interface VendorInvoiceListProps {
  authToken: string;
}

const SKELETON_ROWS = 4;

function formatCurrency(amount: number): string {
  // Same tabular-nums/font-mono discipline as VendorPayoutLedger.tsx - every rupee figure in
  // this project renders this way so columns don't shift as values change.
  return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

// B6 (Invoice Access), folded into the same page as B2 (Vendor Management) rather than a
// standalone screen, per the session plan's explicit instruction. Every field is rendered
// defensively (falls back to "—") because InvoiceSummary's exact shape is this session's own
// open question - see adminInvoicesApi.ts's comment for why.
export function VendorInvoiceList({ authToken }: VendorInvoiceListProps) {
  const {
    invoices,
    invoicesLoading,
    invoicesError,
    fetchInvoices,
    downloadInvoiceById,
    downloadingInvoiceId,
    downloadError,
  } = useAdminVendorStore();

  return (
    <div className="rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <h3 className="font-display text-base text-brand-indigo">Invoices</h3>
        {invoices && (
          <p className="text-xs opacity-60">
            {invoices.totalElements} invoice{invoices.totalElements === 1 ? "" : "s"}
          </p>
        )}
      </div>

      {invoicesLoading && (
        <ul className="space-y-3 p-4" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-brand-indigo/5" />
          ))}
        </ul>
      )}

      {!invoicesLoading && invoicesError && (
        <div
          role="alert"
          className="m-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {invoicesError}
        </div>
      )}

      {!invoicesLoading && !invoicesError && invoices?.empty && (
        <div className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText size={26} className="text-brand-indigo/20" aria-hidden="true" />
          <p className="text-sm opacity-60">No invoices for this vendor yet.</p>
        </div>
      )}

      {downloadError && (
        <div
          role="alert"
          className="mx-4 mt-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text"
        >
          {downloadError}
        </div>
      )}

      {!invoicesLoading && !invoicesError && invoices && !invoices.empty && (
        <ul>
          {invoices.content.map((invoice) => {
            const isDownloading = downloadingInvoiceId === invoice.id;
            return (
              <li
                key={invoice.id}
                className="flex items-center justify-between gap-3 border-b border-brand-indigo/5 px-6 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <FileText size={18} className="shrink-0 text-brand-indigo/30" aria-hidden="true" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-brand-indigo">
                      {invoice.invoiceNumber || `Invoice #${invoice.id}`}
                    </p>
                    <p className="truncate text-xs opacity-60">
                      Order #{invoice.orderId ?? "—"} · {formatDate(invoice.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="tabular-nums font-mono text-sm text-brand-indigo/70">
                    {typeof invoice.totalAmount === "number" ? formatCurrency(invoice.totalAmount) : "—"}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      downloadInvoiceById(invoice.id, invoice.invoiceNumber, authToken)
                    }
                    disabled={isDownloading}
                    aria-label={`Download ${invoice.invoiceNumber || `invoice ${invoice.id}`}`}
                    className="flex min-h-11 min-w-11 items-center justify-center rounded-md text-brand-indigo/50
                      hover:bg-brand-indigo/5 hover:text-brand-indigo focus-visible:ring-2 focus-visible:ring-offset-2
                      focus-visible:ring-brand-indigo disabled:opacity-40 transition"
                  >
                    {isDownloading ? (
                      <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    ) : (
                      <Download size={16} aria-hidden="true" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {invoices && !invoices.empty && (
        <Pagination
          page={invoices.number}
          totalPages={invoices.totalPages}
          first={invoices.first}
          last={invoices.last}
          disabled={invoicesLoading}
          onPageChange={(page) => fetchInvoices(page, authToken)}
        />
      )}
    </div>
  );
}
