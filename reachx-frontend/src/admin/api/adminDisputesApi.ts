// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source this
// session (DisputeController.java + DisputeService.java + DisputeResponse/ResolveDisputeRequest
// DTOs + Dispute.java entity) - same discipline as adminKycApi.ts / vendor/api/disputesApi.ts.
//
// The row shape returned by the admin-facing GET /disputes (byStatus) is DisputeResponse, the
// exact same DTO vendor/api/disputesApi.ts already types as VendorDispute for GET /disputes/mine
// - DisputeController#byStatus and #mine both return Page<DisputeResponse> from the same
// service/repository. No separate admin-only shape exists, so this file re-exports that type
// instead of redeclaring an identical interface (same reasoning adminKycApi.ts gives for reusing
// VendorResponse as VendorSummary rather than inventing a second type for the same JSON).

import type { Page } from "../../vendor/api/payoutApi";
import type { DisputeCategory, VendorDispute } from "../../vendor/api/disputesApi";

export type { DisputeCategory };
export type Dispute = VendorDispute;

// Dispute.DisputeStatus - the real enum, verbatim. Re-declared here (rather than imported) only
// because vendor/api/disputesApi.ts's DisputeStatus type is correct but that file has no reason
// to export a resolution-only subset - ResolveDisputeRequest.resolution only ever accepts one of
// the three RESOLVED_* values, never OPEN/UNDER_REVIEW (that would be a status GlobalException
// would reject as a bad enum value if attempted, but it's cleaner to make it structurally
// impossible from this side).
export type DisputeStatus = "OPEN" | "UNDER_REVIEW" | "RESOLVED_REFUNDED" | "RESOLVED_REJECTED" | "RESOLVED_REPLACED";
export type DisputeResolution = "RESOLVED_REFUNDED" | "RESOLVED_REJECTED" | "RESOLVED_REPLACED";

export interface ResolveDisputeRequest {
  resolution: DisputeResolution;
  notes: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Matches the confirmed { error, timestamp?, status? } body (GlobalExceptionHandler's
    // buildResponse) - including the specific case DisputeService.resolve() throws
    // IllegalStateException("This dispute has already been resolved"), mapped to 409 and
    // surfaced here as a plain-language message, never a raw "409 Conflict".
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /disputes?status=X - ADMIN only. Backend takes exactly one status value (defaultValue
// "OPEN" server-side, but this wrapper always sends it explicitly rather than relying on the
// server default going out of sync with what the UI shows as selected). There is no "all
// statuses" query support - DisputeController#byStatus does Dispute.DisputeStatus.valueOf(status),
// a single enum lookup, not an IN-list - so no combined/unfiltered view is offered client-side
// either; that would silently imply a backend capability that doesn't exist.
export async function listDisputesByStatus(
  status: DisputeStatus,
  token: string,
  page = 0,
  size = 20
): Promise<Page<Dispute>> {
  const res = await fetch(
    `${API_BASE}/disputes?status=${status}&page=${page}&size=${size}&sort=createdAt,asc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<Dispute>>(res);
}

// PATCH /disputes/{id}/resolve - ADMIN only. No refundAmount field - confirmed against
// ResolveDisputeRequest, which only carries { resolution, notes }. The backend derives and moves
// money itself (RefundService.initiateRefund for RESOLVED_REFUNDED, releasing the held
// commission-record payout for RESOLVED_REJECTED) off the enum alone; adding a refund-amount
// input here would be a client field with nowhere real to go.
export async function resolveDispute(
  id: number,
  request: ResolveDisputeRequest,
  token: string
): Promise<Dispute> {
  const res = await fetch(`${API_BASE}/disputes/${id}/resolve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(request),
  });
  return unwrap<Dispute>(res);
}
