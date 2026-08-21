// Thin wrapper around the real backend contract - checked directly against
// karunaalekya/reachx-marketplace's marketplace-springboot source this session (controllers +
// DTOs + entities read, not inferred from MASTER_BLUEPRINT.md prose alone). No invented fields,
// same discipline as kycApi.ts / accountHealthApi.ts.
//
// IMPORTANT CORRECTION vs. the Session 3 plan on record in FRONTEND_STATE.md /
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md: the line-item breakdown (gross / commission / TCS /
// TDS / net) does NOT live on GET /payouts/mine. PayoutResponse only carries the transfer/
// settlement side (amount, gateway, status, failureReason) - it's what RazorpayX/Cashfree did
// with the money, not how that number was derived. The actual per-order ledger line comes from
// GET /commissions/mine (CommissionController), which is where grossAmount/commissionAmount/
// tcsAmount/tdsAmount/vendorNetPayable actually live (CommissionRecordResponse). This file fetches
// both and the ledger component joins them by orderId.
//
// Also correcting the "CGST/SGST/IGST" accordion breakdown floated in
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3i: that split does not exist anywhere in the real
// schema. CommissionRecord only carries combined tcsAmount/tdsAmount (no per-tax-head GST split).
// A CGST/SGST/IGST field on an inter-vendor marketplace commission isn't how this backend models
// tax at all - a real GSTIN-vs-GSTIN CGST/SGST/IGST split lives on the underlying order/invoice,
// not the commission record. The ledger below renders TCS/TDS only - the fields that actually
// exist - rather than fabricating GST columns nobody asked the backend for.

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // 0-indexed current page
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

// CommissionRecord.PayoutStatus - distinct enum from Payout.PayoutStatus below, same name,
// different meaning: this one tracks the commission-record-level lifecycle (has this order's
// earnings been swept into a Payout yet, or is it held/cancelled), not the gateway transfer
// itself.
export type CommissionPayoutStatus = "PENDING" | "PAID_OUT" | "HELD_FOR_DISPUTE" | "CANCELLED_REFUNDED";

export interface CommissionRecord {
  id: number;
  orderId: number;
  vendorId: number;
  grossAmount: number;
  commissionRate: number;
  commissionAmount: number;
  vendorPayoutAmount: number;
  tcsAmount: number;
  tdsAmount: number;
  vendorNetPayable: number;
  payoutStatus: CommissionPayoutStatus;
  createdAt: string;
}

// Payout.PayoutStatus - the actual gateway transfer's lifecycle. BLOCKED is kept distinct from
// FAILED in the real backend (never sent to the gateway at all, e.g. no verified payout account,
// vs. the gateway was called and rejected/errored) - the ledger surfaces that distinction rather
// than collapsing both to a generic "failed".
export type PayoutStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "BLOCKED";

export interface PayoutRecord {
  id: number;
  orderId: number;
  vendorId: number;
  amount: number;
  gateway: string;
  gatewayTransferId: string | null;
  status: PayoutStatus;
  failureReason: string | null;
  retryCount: number;
  initiatedAt: string | null;
  completedAt: string | null;
}

// GET /tax-withholding/mine/{financialYear} literally returns Map.of("tcs", tcs, "tds", tds) -
// a flat two-key object, not per-order records. There is no vendor-facing per-order tax
// breakdown endpoint (only GET /tax-withholding/vendor/{vendorId}, which is ADMIN-only).
export interface TaxWithholdingTotals {
  tcs: number;
  tds: number;
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

// GET /commissions/mine - the real per-order ledger line (gross/commission/TCS/TDS/net).
export async function listCommissions(
  token: string,
  page = 0,
  size = 25
): Promise<Page<CommissionRecord>> {
  const res = await fetch(
    `${API_BASE}/commissions/mine?page=${page}&size=${size}&sort=createdAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<CommissionRecord>>(res);
}

// GET /commissions/mine/pending-total - single number, not derivable client-side from one page
// of results (pagination would make a client-side sum wrong past the first page).
export async function getPendingPayoutTotal(token: string): Promise<number> {
  const res = await fetch(`${API_BASE}/commissions/mine/pending-total`, {
    headers: authHeaders(token),
  });
  const body = await unwrap<{ pendingPayout: number }>(res);
  return body.pendingPayout;
}

// GET /payouts/mine - settlement/transfer status, joined to commissions by orderId in the store.
export async function listPayouts(token: string, page = 0, size = 25): Promise<Page<PayoutRecord>> {
  const res = await fetch(`${API_BASE}/payouts/mine?page=${page}&size=${size}&sort=createdAt,desc`, {
    headers: authHeaders(token),
  });
  return unwrap<Page<PayoutRecord>>(res);
}

// GET /tax-withholding/mine/{financialYear} - financialYear format is "YYYY-YY" (e.g.
// "2026-27"), Apr1-Mar31 convention - see currentFinancialYear() in TaxWithholdingService.
export async function getTaxWithholding(
  token: string,
  financialYear: string
): Promise<TaxWithholdingTotals> {
  const res = await fetch(`${API_BASE}/tax-withholding/mine/${financialYear}`, {
    headers: authHeaders(token),
  });
  return unwrap<TaxWithholdingTotals>(res);
}

// Apr1-Mar31 Indian FY convention, mirrors the backend's own currentFinancialYear() exactly so
// the default FY the ledger opens on always matches what the backend would compute as "current" -
// not reimplemented differently or guessed.
export function currentFinancialYear(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const startYear = now.getUTCMonth() + 1 >= 4 ? year : year - 1; // getUTCMonth is 0-indexed
  const endYearShort = (startYear + 1) % 100;
  return `${startYear}-${String(endYearShort).padStart(2, "0")}`;
}
