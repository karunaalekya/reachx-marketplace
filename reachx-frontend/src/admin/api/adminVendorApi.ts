// GET /vendors/{id} - referenced conceptually throughout this project (FRONTEND_STATE.md issue
// #6, useVendorStore.ts's "source of truth" comment) but never actually wrapped in a fetch call
// anywhere in the frontend until this session - every prior session had its own vendor's id from
// the login response (`userId`) and never needed to look another vendor up by id. The admin
// console is the first surface that does.
//
// Field list matches what's been independently confirmed elsewhere in this codebase:
// `businessName`/`kycStatus` (useVendorStore.ts's deriveOverallStatus mirrors this exact status),
// `panOnFile` (FRONTEND_STATE.md issue #6, added specifically to support the PAN-aware TDS fix).
// `status` (ACTIVE/INACTIVE - see PRESENT_POSITION_AND_DESIGN_DECISIONS.md's note on suspend
// being a separate explicit action from a KYC document rejection) is included since the admin
// console needs to show it, but this session did not independently re-confirm its exact string
// values against source (no network access this session - see FRONTEND_STATE.md Session 8).
// Treat `status` as reported, not verified, same caveat as the rest of this pass.

export type VendorKycStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface VendorSummary {
  id: number;
  businessName: string;
  email: string;
  kycStatus: VendorKycStatus;
  panOnFile: boolean;
  status: string;
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

export async function getVendor(vendorId: number, token: string): Promise<VendorSummary> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}`, { headers: authHeaders(token) });
  return unwrap<VendorSummary>(res);
}
