// GET /api/v1/vendors/{id}/account-health - confirmed live this session (smoke-tested, not just
// compiled), per PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3j. Shape matches the confirmed
// example exactly: { overallScore, rating, kycScore, fulfilmentScore, disputeScore }.

export interface AccountHealth {
  overallScore: number;
  // Confirmed live example returned "GOOD" (uppercase). Typed as `string` rather than a narrow
  // union of the documented rating bands (Excellent/Good/Needs Attention/At Risk) - the doc's
  // band names and the live example's casing don't match exactly, and guessing which one is
  // canonical would be exactly the kind of invented contract this project has been burned by
  // before. Callers should derive their own tier from `overallScore` (see ActionCenterCard) and
  // treat `rating` as display text only.
  rating: string;
  kycScore: number;
  fulfilmentScore: number;
  disputeScore: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

export async function getAccountHealth(vendorId: number, token: string): Promise<AccountHealth> {
  const res = await fetch(`${API_BASE}/vendors/${vendorId}/account-health`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to load account health (${res.status})`);
  }
  return res.json() as Promise<AccountHealth>;
}
