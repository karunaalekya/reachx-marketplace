// Track B Session 3 (B6 Invoice Access, folded into the vendor-management session per the
// locked build order). Real difference from every other admin api file in this project, stated
// plainly rather than glossed over: the session plan names both endpoints
// (`GET /invoices/vendor/{vendorId}`, `GET /invoices/{id}/download`) but - unlike the KYC and
// dispute sessions, which each opened with "checked directly against
// VendorController.java/DisputeController.java" - it does not hand off a confirmed
// InvoiceResponse field list the way VendorSummary/VendorKycDocument/Dispute were. This session
// did not have InvoiceController.java/InvoiceResponse.java source to read.
//
// Rather than inventing a full field set the way gstEngine.ts's signature was invented twice
// before (and corrected twice, see PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3f/3g), this file
// types the row narrowly - only the fields an invoice list plausibly can't ship without
// (id, invoiceNumber, createdAt) plus the two the UI needs to link an invoice back to what it's
// for (orderId, totalAmount) - and the consuming component renders every one of those
// defensively (falls back to "—" rather than crashing) so a real, differently-shaped
// InvoiceResponse doesn't break the page, it just under-displays until this type gets corrected
// against real source. Flagged here as this session's own B-OQ, same pattern as B-OQ2/B-OQ3 in
// the session plan: confirm InvoiceResponse's real fields before trusting this file fully.
export interface InvoiceSummary {
  id: number;
  invoiceNumber: string;
  orderId: number;
  totalAmount: number;
  createdAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /invoices/vendor/{vendorId} - ADMIN only, paginated per the session plan.
export async function listVendorInvoices(
  vendorId: number,
  token: string,
  page = 0,
  size = 20
): Promise<Page<InvoiceSummary>> {
  const res = await fetch(
    `${API_BASE}/invoices/vendor/${vendorId}?page=${page}&size=${size}&sort=createdAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<InvoiceSummary>>(res);
}

// GET /invoices/{id}/download - a 302 redirect to a PDF bucket URL, per the session plan. This
// is NOT rendered as a plain `<a href="...">download</a>` - that endpoint sits behind the same
// `@PreAuthorize("hasRole('ADMIN')")` guard as every other admin endpoint in this project, and a
// bare anchor navigation can't attach the in-memory JWT as an Authorization header the way every
// other authenticated call in this codebase does. Instead: `fetch()` with the header (browsers'
// default `redirect: "follow"` transparently follows the 302 to the bucket URL and does NOT
// resend the Authorization header cross-origin to the bucket host - the correct behavior, not a
// bug, and the reason this works as a plain `fetch` rather than needing anything special), then
// the resulting PDF blob is downloaded via a temporary object URL - same pattern
// kycApi.ts's presigned-upload flow already uses for the reverse direction (blob out instead of
// in).
export async function downloadInvoice(invoiceId: number, token: string, fileName: string): Promise<void> {
  const res = await fetch(`${API_BASE}/invoices/${invoiceId}/download`, {
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
