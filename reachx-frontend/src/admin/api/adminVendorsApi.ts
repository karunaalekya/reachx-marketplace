// Track B Session 3 (B2 Vendor Management). Checked against the same real source this project's
// prior admin sessions read directly (VendorController.java + VendorResponse/AccountHealthResponse
// DTOs) - not inferred from the session-plan prose alone, same discipline as adminKycApi.ts /
// adminDisputesApi.ts before it.
//
// `getVendor` already exists in adminKycApi.ts (used there for the KYC split-pane header) - not
// redeclared here. This file only adds the endpoints B2 actually needs on top of that: account
// health, commission-rate update, suspend, reactivate.

import type { VendorSummary } from "./adminKycApi";

// AccountHealthResponse.java, confirmed against PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3j
// (backend built and merged in an earlier session): { overallScore, rating, kycScore,
// fulfilmentScore, disputeScore }. `rating` stays a plain string, not narrowed to the four band
// names - vendor/api/accountHealthApi.ts already flagged a casing mismatch between the doc's
// band vocabulary and the live example ("GOOD" vs "Good") and this file inherits that same
// caution rather than re-guessing which casing is canonical.
export interface AccountHealth {
  overallScore: number;
  rating: string;
  kycScore: number;
  fulfilmentScore: number;
  disputeScore: number;
}

export interface UpdateCommissionRateRequest {
  commissionRate: number;
}

export interface SuspendVendorRequest {
  reason: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Same { error, timestamp?, status? } body every other admin endpoint in this project uses -
    // rendered as plain language in the UI, never a raw "400 Bad Request".
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /vendors/{id}/account-health - ADMIN or VENDOR. Distinct from vendor/api/accountHealthApi.ts
// only in that this file follows the admin api files' own conventions (authHeaders/unwrap
// pattern, { error } body shape) rather than sharing that file's - same endpoint, same response,
// two thin wrappers per side rather than one shared module reaching across the vendor/admin
// module boundary this project's directory structure deliberately keeps separate.
export async function getVendorAccountHealth(vendorId: number, token: string): Promise<AccountHealth> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/account-health`, {
    headers: authHeaders(token),
  });
  return unwrap<AccountHealth>(res);
}

// PATCH /vendors/{id}/commission-rate - ADMIN only.
export async function updateCommissionRate(
  vendorId: number,
  request: UpdateCommissionRateRequest,
  token: string
): Promise<VendorSummary> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/commission-rate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(request),
  });
  return unwrap<VendorSummary>(res);
}

// PATCH /vendors/{id}/suspend - ADMIN only, reason required (backend @NotBlank, same enforcement
// ConfirmReasonDialog already applies client-side for KYC rejection).
export async function suspendVendor(
  vendorId: number,
  request: SuspendVendorRequest,
  token: string
): Promise<VendorSummary> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/suspend`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders(token) },
    body: JSON.stringify(request),
  });
  return unwrap<VendorSummary>(res);
}

// PATCH /vendors/{id}/reactivate - ADMIN only, no body per the session plan ("no body" stated
// explicitly against this one endpoint, unlike suspend).
export async function reactivateVendor(vendorId: number, token: string): Promise<VendorSummary> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/reactivate`, {
    method: "PATCH",
    headers: authHeaders(token),
  });
  return unwrap<VendorSummary>(res);
}
