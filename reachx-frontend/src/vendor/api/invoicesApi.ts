// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source
// this session (InvoiceController, InvoiceResponse - controller + DTO read, not inferred from
// prose alone). Same discipline as payoutApi.ts/productsApi.ts.
//
// GST invoice generation itself (InvoiceService/InvoicePdfGenerator/ShipmentCreatedInvoiceListener)
// is backend-automatic - triggered off a shipment-created event, not something the vendor
// initiates from here. This file only exposes the two real vendor-facing reads: the paginated
// list and the PDF download redirect. There is no vendor-facing create/edit - invoices are
// system-generated, immutable records.

import type { Page } from "./payoutApi";

// Invoice.TaxType - the real enum, verbatim. CGST_SGST when vendor and customer share a state,
// IGST otherwise (see InvoiceService's tax-split logic) - this file doesn't recompute that, only
// displays whichever the backend already decided.
export type InvoiceTaxType = "CGST_SGST" | "IGST";

// InvoiceResponse - the real record, field-for-field. Money fields arrive as backend BigDecimal
// -> JSON number, same convention as CommissionRecord/PayoutRecord elsewhere in this project.
export interface Invoice {
  id: number;
  invoiceNumber: string;
  orderId: number;
  vendorId: number;
  taxType: InvoiceTaxType;
  taxRatePercent: number;
  taxableValue: number;
  shippingFeeAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalAmount: number;
  pdfUrl: string;
  generatedAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// GET /invoices/mine - vendor's own invoices, newest first. No server-side filter beyond
// vendor scoping (unlike GET /orders/mine's status param) - InvoiceController takes no query
// params besides Pageable, so client-side search/filter would be the panel's own job, not a
// server capability to wire up.
export async function listMyInvoices(token: string, page = 0, size = 25): Promise<Page<Invoice>> {
  const res = await fetch(`${API_BASE}/invoices/mine?page=${page}&size=${size}`, {
    headers: authHeaders(token),
  });
  return unwrap<Page<Invoice>>(res);
}

// GET /invoices/mine/{id}/download - a 302 redirect to the PDF's real bucket URL, not a JSON
// body. NOT rendered as a plain `<a href="...">` - that endpoint sits behind the same
// `@PreAuthorize("hasRole('VENDOR')")` guard as every other vendor endpoint in this project,
// and a bare anchor navigation can't attach the in-memory JWT as an Authorization header the
// way every other authenticated call in this codebase does. Instead: fetch() with the header
// (the browser's default redirect: "follow" transparently follows the 302 to the bucket URL and
// does NOT resend the Authorization header cross-origin to the bucket host - correct behavior,
// not a bug), then the resulting PDF blob is downloaded via a temporary object URL. Same pattern
// as admin/api/adminInvoicesApi.ts's downloadInvoice - kept as a separate vendor-scoped function
// (hitting /invoices/mine/{id}/download, not /invoices/{id}/download) rather than shared, since
// the two sit behind different @PreAuthorize roles and different URL paths server-side.
export async function downloadMyInvoice(invoiceId: number, token: string, fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/invoices/mine/${invoiceId}/download`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to download invoice (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
