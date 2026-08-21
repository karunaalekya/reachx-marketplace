// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source
// (DisputeController, DisputeResponse, Dispute.DisputeCategory, Dispute.DisputeStatus) - not
// inferred. Same discipline as payoutApi.ts / ordersApi.ts.
//
// Deliberately read-only here: raising a dispute (POST /disputes) is a PUBLIC, customer-facing
// action per DisputeController - it's not something a vendor does from this dashboard, so this
// file only wraps GET /disputes/mine. Resolving a dispute is ADMIN-only
// (PATCH /disputes/{id}/resolve) - also out of scope for a vendor-facing file.

import type { Page } from "./payoutApi";

// Dispute.DisputeCategory - the real enum, verbatim.
export type DisputeCategory =
  | "ITEM_NOT_RECEIVED"
  | "ITEM_DAMAGED"
  | "ITEM_NOT_AS_DESCRIBED"
  | "WRONG_ITEM"
  | "REFUND_REQUEST"
  | "OTHER";

// Dispute.DisputeStatus - the real enum, verbatim. Three distinct RESOLVED_* outcomes rather
// than one generic "RESOLVED" - the ledger/UI should surface which way it resolved, not just
// that it's closed.
export type DisputeStatus =
  | "OPEN"
  | "UNDER_REVIEW"
  | "RESOLVED_REFUNDED"
  | "RESOLVED_REJECTED"
  | "RESOLVED_REPLACED";

export interface VendorDispute {
  id: number;
  orderId: number;
  vendorId: number;
  raisedByEmail: string;
  category: DisputeCategory;
  description: string;
  status: DisputeStatus;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
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

// GET /disputes/mine
export async function listMyDisputes(token: string, page = 0, size = 20): Promise<Page<VendorDispute>> {
  const res = await fetch(
    `${API_BASE}/disputes/mine?page=${page}&size=${size}&sort=createdAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<VendorDispute>>(res);
}
