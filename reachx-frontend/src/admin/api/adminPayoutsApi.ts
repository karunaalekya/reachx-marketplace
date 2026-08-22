// Track B Session 4 (B4 Payout Ops). Same discipline as every other admin api file in this
// project - endpoints and shapes taken from the session plan's confirmed contract, not guessed.
//
// PayoutRecord/PayoutStatus already exist in vendor/api/payoutApi.ts (built Session 3 of the
// vendor-side track, against the same PayoutResponse DTO: id/orderId/vendorId/amount/gateway/
// gatewayTransferId/status/failureReason/retryCount/initiatedAt/completedAt). The admin-facing
// GET /payouts (all vendors) and GET /payouts/vendor/{id} return that exact same DTO shape -
// PayoutController's admin methods and #mine all serialize the same PayoutResponse - so this
// file re-exports rather than redeclaring an identical type, same reasoning adminDisputesApi.ts
// gives for reusing VendorDispute as Dispute.

import type { Page, PayoutRecord, PayoutStatus } from "../../vendor/api/payoutApi";

export type { PayoutRecord, PayoutStatus };

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Same { error, timestamp?, status? } body every other admin endpoint in this project
    // uses - rendered as plain language, never a raw "400 Bad Request".
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /payouts?status=X - ADMIN only, all vendors. status is optional per the session plan
// ("optional filter") - unlike GET /disputes?status=X, which the backend requires (defaultValue
// "OPEN" server-side, no combined-view support). Omitting status here sends no query param at
// all rather than guessing a server-side "ALL" sentinel value that was never confirmed to exist.
export async function listPayouts(
  token: string,
  status: PayoutStatus | undefined,
  page = 0,
  size = 20
): Promise<Page<PayoutRecord>> {
  const statusQuery = status ? `status=${status}&` : "";
  const res = await fetch(
    `${API_BASE}/payouts?${statusQuery}page=${page}&size=${size}&sort=initiatedAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<PayoutRecord>>(res);
}

// GET /payouts/vendor/{vendorId} - ADMIN only, one vendor's ledger. No status filter in the
// session plan for this endpoint - it's the full per-vendor history, not a queue.
export async function listVendorPayouts(
  vendorId: number,
  token: string,
  page = 0,
  size = 20
): Promise<Page<PayoutRecord>> {
  const res = await fetch(
    `${API_BASE}/payouts/vendor/${vendorId}?page=${page}&size=${size}&sort=initiatedAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<PayoutRecord>>(res);
}

// GET /payouts/{id} - ADMIN only. Used to pull a single row's authoritative state - e.g. to
// re-check a row after a retry rather than trusting a client-side guess.
export async function getPayout(id: number, token: string): Promise<PayoutRecord> {
  const res = await fetch(`${API_BASE}/payouts/${id}`, { headers: authHeaders(token) });
  return unwrap<PayoutRecord>(res);
}

// POST /payouts/{id}/retry - ADMIN only, no body per the session plan. Manual and explicit
// only, per the production-UX baseline ("never auto-retry a mutation silently... a silent
// auto-retry risks a double transfer"). The response is the real, updated PayoutRecord - the
// caller reflects that returned row, never an optimistic client-side status flip.
export async function retryPayout(id: number, token: string): Promise<PayoutRecord> {
  const res = await fetch(`${API_BASE}/payouts/${id}/retry`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return unwrap<PayoutRecord>(res);
}
