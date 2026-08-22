// Admin-side counterpart to ../../vendor/api/disputesApi.ts, which is deliberately read-only
// (see its header comment) because a vendor can neither raise nor resolve a dispute. This file
// is where the two write/read paths that comment named actually live.
//
// PATCH /disputes/{id}/resolve is confirmed real - disputesApi.ts's header comment names it
// explicitly as the ADMIN-only counterpart to the public POST /disputes. Its exact request body
// is NOT independently confirmed this session (no network access - see FRONTEND_STATE.md Session
// 8 caveat); the shape below (`status` + `resolutionNotes`) is inferred from the response DTO
// this project already has confirmed (`VendorDispute` in disputesApi.ts carries exactly these
// two fields as `status`/`resolutionNotes`, set once a dispute resolves) - a resolve call setting
// the same two fields it's known to populate is the most direct reading, not a guess pulled from
// nowhere, but flag it for confirmation against DisputeController before trusting it live.
//
// GET /disputes/{id} is NOT confirmed against source either. It's inferred by analogy to this
// project's own established pattern: OrderController exposes both a collection endpoint
// (GET /orders/mine) and an individual-by-id endpoint (GET /orders/{id} - see ordersApi.ts /
// FRONTEND_STATE.md's note on its public-no-auth-check leak, which only exists because that
// endpoint is real). DisputeController's public POST /disputes creating an individual dispute
// resource makes a symmetric GET /disputes/{id} a reasonable, common REST shape - but "reasonable
// by analogy" is exactly the kind of inference this project has been wrong about before (the
// original single-document KYC assumption, the CGST/SGST/IGST split). Confirm this against
// DisputeController directly before relying on it; until then, treat a failed lookup here as
// "unconfirmed endpoint," not "dispute doesn't exist."

import type { VendorDispute, DisputeStatus } from "../../vendor/api/disputesApi";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getDispute(disputeId: number, token: string): Promise<VendorDispute> {
  const res = await fetch(`${API_BASE}/disputes/${disputeId}`, { headers: authHeaders(token) });
  return unwrap<VendorDispute>(res);
}

export interface ResolveDisputeRequest {
  status: Extract<DisputeStatus, "RESOLVED_REFUNDED" | "RESOLVED_REJECTED" | "RESOLVED_REPLACED">;
  resolutionNotes: string;
}

export async function resolveDispute(
  disputeId: number,
  body: ResolveDisputeRequest,
  token: string
): Promise<VendorDispute> {
  const res = await fetch(`${API_BASE}/disputes/${disputeId}/resolve`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
  return unwrap<VendorDispute>(res);
}
