// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source
// this session (VendorController.java + VendorResponse/VendorKycDocumentResponse/
// KycDocumentDecisionRequest DTOs) - not inferred from blueprint prose alone. Same discipline
// as vendor/api/payoutApi.ts / disputesApi.ts.
//
// Resolves the open question carried in the session plan ("GET /vendors/pending-kyc row shape
// not confirmed"): it is NOT a bespoke summary DTO. VendorController#pendingKyc returns
// Page<VendorResponse> - the exact same shape as GET /vendors/{id}. No separate type needed;
// this file reuses VendorResponse for both.

import type { Page } from "../../vendor/api/payoutApi";

// Vendor.KycStatus - the real enum, verbatim (vendor-level rollup, distinct from each
// document's own DocStatus below).
export type VendorKycStatus = "PENDING" | "UNDER_REVIEW" | "APPROVED" | "REJECTED";

// Vendor.VendorStatus - the real enum, verbatim.
export type VendorAccountStatus = "INACTIVE" | "ACTIVE" | "SUSPENDED";

// Matches VendorResponse.java field-for-field, including `panOnFile` (boolean presence flag,
// never the raw PAN number - the backend never returns it, by design, see the DTO's own
// comment).
export interface VendorSummary {
  id: number;
  businessName: string;
  email: string;
  phone: string;
  kycStatus: VendorKycStatus;
  status: VendorAccountStatus;
  commissionRate: number;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  pincode: string;
  pickupLocationName: string | null;
  emailVerified: boolean;
  panOnFile: boolean;
  createdAt: string;
}

// VendorKycDocument.DocType - the real enum, verbatim. required is server-derived (from the
// enum's own isRequired()) and echoed per-document rather than the frontend hardcoding which
// three of four types are mandatory - if a fifth type is ever added server-side, this stays
// correct without a frontend redeploy.
export type KycDocType = "PAN" | "GSTIN" | "BANK_CHEQUE" | "MSME_CERTIFICATE";

// VendorKycDocument.DocStatus - the real enum, verbatim.
export type KycDocStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface VendorKycDocument {
  id: number;
  docType: KycDocType;
  required: boolean;
  documentUrl: string;
  status: KycDocStatus;
  rejectionReason: string | null;
  uploadedAt: string;
  decidedAt: string | null;
}

export interface KycDocumentDecision {
  approved: boolean;
  rejectionReason?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    // Matches the confirmed error body { error, timestamp?, status? } - not { message } like
    // the older authApi.ts fallback. Falls back to statusText only if the body itself doesn't
    // parse, never invents a message.
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /vendors/pending-kyc - ADMIN only.
export async function listPendingKyc(
  token: string,
  page = 0,
  size = 20
): Promise<Page<VendorSummary>> {
  const res = await fetch(
    `${API_BASE}/vendors/pending-kyc?page=${page}&size=${size}&sort=createdAt,asc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<VendorSummary>>(res);
}

// GET /vendors/{id} - ADMIN or VENDOR, used here for the split-pane header (business name,
// GSTIN-on-file flag, etc.) once a vendor row is selected from the queue.
export async function getVendor(id: number, token: string): Promise<VendorSummary> {
  const res = await fetch(`${API_BASE}/vendors/${id}`, { headers: authHeaders(token) });
  return unwrap<VendorSummary>(res);
}

// GET /vendors/{id}/kyc-documents - ADMIN or VENDOR.
export async function listKycDocuments(id: number, token: string): Promise<VendorKycDocument[]> {
  const res = await fetch(`${API_BASE}/vendors/${id}/kyc-documents`, {
    headers: authHeaders(token),
  });
  return unwrap<VendorKycDocument[]>(res);
}

// PATCH /vendors/{id}/kyc-documents/{documentId}/decision - ADMIN only. Per-document, not
// per-vendor - there is no bulk-approve-all endpoint, so no such function exists here either.
export async function decideKycDocument(
  vendorId: number,
  documentId: number,
  decision: KycDocumentDecision,
  token: string
): Promise<VendorKycDocument> {
  const res = await fetch(
    `${API_BASE}/vendors/${vendorId}/kyc-documents/${documentId}/decision`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeaders(token) },
      body: JSON.stringify(decision),
    }
  );
  return unwrap<VendorKycDocument>(res);
}
