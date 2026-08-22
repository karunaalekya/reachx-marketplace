import { useEffect } from "react";
import { FileText, Download, Loader2 } from "lucide-react";
import { useInvoicesStore } from "../store/useInvoicesStore";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { Pagination } from "../../shared/components/Pagination";
import type { Invoice } from "../api/invoicesApi";

// GST invoices are generated automatically off a shipment-created event (see
// invoicesApi.ts header) - this panel is read-only by design, same as OrdersPanel's shipment
// tracking. There is no create/edit action anywhere on this screen because there is no such
// endpoint to call.

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const MONEY = "font-mono tabular-nums";

const SKELETON_ROWS = 6;

interface VendorInvoicesPanelProps {
  authToken: string;
}

export function VendorInvoicesPanel({ authToken }: VendorInvoicesPanelProps) {
  const {
    invoices,
    page,
    totalPages,
    isLoading,
    error,
    downloadingId,
    downloadError,
    fetchInvoices,
    downloadInvoice,
  } = useInvoicesStore();

  useEffect(() => {
    fetchInvoices(authToken, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useRefetchOnFocus(() => {
    fetchInvoices(authToken);
  });

  function handleDownload(invoice: Invoice) {
    downloadInvoice(authToken, invoice);
  }

  return (
    <div className="rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <h2 className="font-display text-lg text-brand-indigo">Invoices</h2>
        <p className="text-xs opacity-60">
          GST invoices are generated automatically once an order ships. This list is read-only.
        </p>
      </div>

      {isLoading && (
        <ul className="space-y-3 p-4" aria-hidden="true">
          {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
            <li key={i} className="h-14 animate-pulse rounded-md bg-brand-indigo/5" />
          ))}
        </ul>
      )}

      {error && (
        <div role="alert" className="m-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text">
          {error}
        </div>
      )}

      {downloadError && (
        <div role="alert" className="mx-4 mt-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text">
          {downloadError}
        </div>
      )}

      {!isLoading && !error && invoices.length === 0 && (
        <div className="flex flex-col items-center gap-3 p-12 text-center">
          <FileText size={28} className="text-brand-indigo/30" aria-hidden="true" />
          <p className="text-sm opacity-60">No invoices yet — they appear here once an order ships.</p>
        </div>
      )}

      {!isLoading && !error && invoices.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-brand-indigo/10 text-xs uppercase tracking-wide text-slate-400">
                <th className="px-6 py-3 font-semibold">Invoice #</th>
                <th className="px-6 py-3 font-semibold">Order</th>
                <th className="px-6 py-3 font-semibold">Tax type</th>
                <th className="px-6 py-3 font-semibold text-right">Total</th>
                <th className="px-6 py-3 font-semibold">Generated</th>
                <th className="px-6 py-3 font-semibold text-right">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-indigo/5">
              {invoices.map((invoice) => (
                <tr key={invoice.id}>
                  <td className="px-6 py-3 font-medium text-brand-indigo">{invoice.invoiceNumber}</td>
                  <td className="px-6 py-3 text-slate-500">#{invoice.orderId}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {invoice.taxType === "CGST_SGST" ? "CGST + SGST" : "IGST"}
                  </td>
                  <td className={`px-6 py-3 text-right ${MONEY}`}>{INR.format(invoice.totalAmount)}</td>
                  <td className="px-6 py-3 text-slate-500">
                    {new Date(invoice.generatedAt).toLocaleDateString("en-IN", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDownload(invoice)}
                      disabled={downloadingId === invoice.id}
                      aria-label={`Download invoice ${invoice.invoiceNumber}`}
                      className="inline-flex items-center gap-1.5 rounded-md border border-brand-indigo/15 px-3 py-1.5 text-xs font-semibold text-brand-indigo
                        transition hover:bg-brand-indigo/5 disabled:cursor-not-allowed disabled:opacity-50
                        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
                    >
                      {downloadingId === invoice.id ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <Download size={14} aria-hidden="true" />
                      )}
                      Download
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isLoading && !error && invoices.length > 0 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          first={page === 0}
          last={page >= totalPages - 1}
          disabled={isLoading}
          onPageChange={(nextPage) => fetchInvoices(authToken, nextPage)}
        />
      )}
    </div>
  );
}
