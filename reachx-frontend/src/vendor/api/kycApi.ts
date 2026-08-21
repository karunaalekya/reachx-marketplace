// Thin wrapper around the real backend contract documented in MASTER_BLUEPRINT.md section 2.
// Every shape here matches a live endpoint - no invented fields, no guessed contract. If the
// backend contract changes again, this file (and the types in ../store/useVendorStore) are the
// only places that should need to know about it.

export type KycDocType = "PAN" | "GSTIN" | "BANK_CHEQUE" | "MSME_CERTIFICATE";
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

interface PresignResponse {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

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

// GET /vendors/{id}/kyc-documents - only returns slots actually uploaded into. A doc type
// missing from this list means "not yet uploaded", not an error - the caller renders that state
// itself rather than expecting a placeholder row from the backend.
export async function listKycDocuments(
  vendorId: number,
  token: string
): Promise<VendorKycDocument[]> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/kyc-documents`, {
    headers: authHeaders(token),
  });
  return unwrap<VendorKycDocument[]>(res);
}

// Upload flow split into two independently-retryable halves, not one atomic function, because
// they fail differently: presign -> PUT puts bytes in the bucket (nothing to retry if it fails -
// the file never landed anywhere); PUT -> confirm tells our backend about a file that's already
// sitting in the bucket, and a dropped connection here is a real, recoverable gap - the file is
// safe, only the backend doesn't know about it yet. `documents` is deliberately excluded from
// `persist` (see useVendorStore.ts), so this can't be an in-memory-only retry that quietly
// vanishes on reload without a trace - the caller is responsible for surfacing `objectKey` to the
// user visibly enough that a retry stays possible even across a refresh, not just a network blip.

// Step 1: presign -> PUT the file directly to the bucket. The file's bytes never pass through our
// own backend - only this browser and the storage bucket ever see them. Returns the objectKey
// needed for step 2; nothing here is safely retryable on its own failure since no bytes moved.
export async function presignAndUploadToBucket(
  vendorId: number,
  docType: KycDocType,
  file: File,
  token: string
): Promise<{ objectKey: string }> {
  const presignRes = await fetch(`${API_BASE}/vendors/${vendorId}/kyc-documents/presign`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fileName: file.name, contentType: file.type, docType }),
  });
  const presign = await unwrap<PresignResponse>(presignRes);

  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("Upload to storage failed - the file never reached the bucket, nothing was confirmed.");
  }

  return { objectKey: presign.objectKey };
}

// Step 2: tell the backend about a file already confirmed present in the bucket. Safe to call
// again on failure - it's idempotent from the caller's side (same objectKey, same doc slot), and
// retrying it is exactly the fix for a connection dropping between the PUT succeeding and this
// call landing.
export async function confirmBucketUpload(
  vendorId: number,
  objectKey: string,
  token: string
): Promise<VendorKycDocument> {
  const confirmRes = await fetch(`${API_BASE}/vendors/${vendorId}/kyc-documents`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ objectKey }),
  });
  return unwrap<VendorKycDocument>(confirmRes);
}

// Convenience wrapper for the common, un-interrupted case - callers that want the split
// presign/confirm control (to handle a dropped confirm) should call the two steps above directly
// instead, as useVendorStore.ts's uploadDocument now does.
export async function uploadKycDocument(
  vendorId: number,
  docType: KycDocType,
  file: File,
  token: string
): Promise<VendorKycDocument> {
  const { objectKey } = await presignAndUploadToBucket(vendorId, docType, file, token);
  return confirmBucketUpload(vendorId, objectKey, token);
}

// Admin-only: PATCH /vendors/{id}/kyc-documents/{documentId}/decision
export async function decideKycDocument(
  vendorId: number,
  documentId: number,
  decision: { approved: boolean; rejectionReason?: string },
  token: string
): Promise<VendorKycDocument> {
  const res = await fetch(
    `${API_BASE}/vendors/${vendorId}/kyc-documents/${documentId}/decision`,
    {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(decision),
    }
  );
  return unwrap<VendorKycDocument>(res);
}
