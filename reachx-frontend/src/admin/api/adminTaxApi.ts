// Track B Session 5 (B5 Tax Withholding Reports). Lowest-priority module per the session plan
// ("internal ops tooling, not launch-blocking... first to cut if time-constrained") - built last
// in the fixed session order, after payouts.
//
// currentFinancialYear() is re-exported rather than redeclared: vendor/api/payoutApi.ts already
// implements the backend's exact Apr1-Mar31 currentFinancialYear() logic (its own comment notes
// this mirrors TaxWithholdingService's server-side calculation so the client default always
// agrees with what the backend would compute as "current") - same reasoning adminPayoutsApi.ts
// gives for re-exporting PayoutRecord/PayoutStatus instead of retyping an identical shape.
export { currentFinancialYear } from "../../vendor/api/payoutApi";

export type TaxType = "TCS" | "TDS";

// Corrected against the real TaxWithholdingController/TaxWithholdingSummary source (previously
// guessed - see git history). GET /tax-withholding/report/{financialYear}/{taxType} actually
// returns TaxWithholdingSummary(vendorId, financialYear, taxType, totalTaxableValue,
// totalAmountWithheld, recordCount) - a record, not the guessed shape. Two concrete corrections:
// there is no businessName field at all (the row only ever has a vendorId - the UI's "Vendor
// #{id}" fallback is actually the ONLY thing that will ever render there, not a fallback for a
// rare gap), and the amount field is `totalAmountWithheld`, not `taxAmount` - the previous name
// was passed unguarded into formatCurrency(), so every render threw
// (`undefined.toLocaleString()`) instead of showing a number. `recordCount` (rendered as
// `orderCount` was) and `totalTaxableValue` (rendered as `grossAmount` was) do exist, just under
// different names - kept the same optional/guarded rendering treatment.
export interface TaxWithholdingSummary {
  vendorId: number;
  financialYear: string;
  taxType: TaxType;
  totalTaxableValue: number;
  totalAmountWithheld: number;
  recordCount: number;
}

// Corrected against the real TaxWithholdingRecord entity (previously guessed). The raw per-order
// row's taxable base and withheld amount are `taxableValue`/`amount` on the entity, not
// `taxableAmount`/`taxAmount` - this one degraded silently (typeof-guarded to "—") rather than
// crashing, but was still wrong. supplyType exists on the entity too; included since the
// drill-down is the natural place to show INTRA_STATE/INTER_STATE.
export interface TaxWithholdingOrderRecord {
  id: number;
  orderId: number;
  taxType: TaxType;
  supplyType?: "INTRA_STATE" | "INTER_STATE";
  taxableValue: number;
  amount: number;
  createdAt: string;
}

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// GET /tax-withholding/report/{financialYear}/{taxType} - ADMIN only. Deliberately NOT called
// through a paginated Page<T> wrapper: unlike GET /tax-withholding/vendor/{vendorId} below, the
// session plan does not tag this endpoint "(paginated)" the way it explicitly does for every
// other list endpoint in this project (payouts, invoices, the vendor-level drill-down right
// below this function) - that's a real, deliberate distinction in the plan's own wording, not an
// oversight to "fix" by wrapping it in pagination it was never confirmed to have. Financial year
// is passed as-is in "YYYY-YY" form (see currentFinancialYear()'s own comment in payoutApi.ts).
export async function getTaxWithholdingReport(
  financialYear: string,
  taxType: TaxType,
  token: string
): Promise<TaxWithholdingSummary[]> {
  const res = await fetch(
    `${API_BASE}/tax-withholding/report/${financialYear}/${taxType}`,
    { headers: authHeaders(token) }
  );
  return unwrap<TaxWithholdingSummary[]>(res);
}

// GET /tax-withholding/vendor/{vendorId} - ADMIN only, paginated per the session plan. Distinct
// from the vendor-facing GET /tax-withholding/mine/{financialYear} in payoutApi.ts, which that
// file's own comment already documents returns a flat `{ tcs, tds }` totals map, not per-order
// records, and is explicitly not this endpoint ("There is no vendor-facing per-order tax
// breakdown endpoint (only GET /tax-withholding/vendor/{vendorId}, which is ADMIN-only)"). This
// is that ADMIN-only endpoint - the real per-order drill-down behind a vendor's report row.
export async function listVendorTaxWithholdingRecords(
  vendorId: number,
  token: string,
  page = 0,
  size = 20
): Promise<Page<TaxWithholdingOrderRecord>> {
  const res = await fetch(
    `${API_BASE}/tax-withholding/vendor/${vendorId}?page=${page}&size=${size}&sort=createdAt,desc`,
    { headers: authHeaders(token) }
  );
  return unwrap<Page<TaxWithholdingOrderRecord>>(res);
}

// Current FY plus the two prior - same window and same reasoning as
// VendorPayoutLedger.tsx's local financialYearOptions() (enough for an admin to reconcile a
// recent filing without a full year picker nobody's asked for). Not imported from that file:
// it's a component-local, unexported helper there, and duplicating this ~4-line pure function
// here is cheaper and less coupling than reaching into another track's component internals to
// force an export refactor that isn't otherwise in this session's scope. The FY math itself is
// identical, so the two lists can never disagree.
export function financialYearOptions(current: string): string[] {
  const [startYear] = current.split("-").map(Number);
  return [0, 1, 2].map((offset) => {
    const start = startYear - offset;
    return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
  });
}
