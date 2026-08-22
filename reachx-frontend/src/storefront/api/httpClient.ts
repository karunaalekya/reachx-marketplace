// Shared fetch helper for the storefront's own API client files (ordersApi.ts, paymentsApi.ts,
// both new this session). `productsApi.ts` (Session 1, not part of this diff) has its own inline
// version of the same unwrap-and-throw convention described in the plan's inherited-conventions
// section - this file exists so Session 3's two new API modules don't each duplicate that a
// third time. Doesn't touch productsApi.ts - not in scope, not broken by this.

export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

interface ApiErrorBody {
  error?: string;
  timestamp?: string;
  status?: number;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// Unwrap-and-throw on non-2xx, per the project's inherited convention - callers render
// `err.message` directly in the UI, never a raw "400 Bad Request".
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });

  if (!res.ok) {
    let body: ApiErrorBody = {};
    try {
      body = await res.json();
    } catch {
      // Non-JSON error body (e.g. a raw 502 from an intermediary proxy) - fall through to the
      // generic message below rather than throwing a JSON-parse error instead of the real one.
    }
    throw new ApiError(
      body.error || `Something went wrong (status ${res.status}). Please try again.`,
      res.status
    );
  }

  // 204/empty-body responses aren't used by anything this client calls today, so a plain
  // `res.json()` is fine - revisit if a future endpoint returns no body on success.
  return res.json() as Promise<T>;
}
