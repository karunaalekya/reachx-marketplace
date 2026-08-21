// Auth API wrapper - built directly against the contract confirmed live this session (see
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md Session 2 update), not guessed. Only login is wired
// here: vendor self-registration (POST /vendors/register) is also confirmed live but was not in
// this session's scope (auth + shell only) - add a registerVendor() here when that's scheduled,
// following the same unwrap-and-throw pattern rather than inventing a new one.

export interface LoginRequest {
  email: string;
  password: string;
}

// Matches the confirmed 200 shape exactly: { token, role, userId, displayName }. `role` is a
// plain string ("VENDOR" | "ADMIN" per the confirmed contract) - typed as `string` rather than a
// union here because no third role value has been confirmed yet and narrowing it early would be
// a guess, not a fact from the contract.
export interface LoginResponse {
  token: string;
  role: string;
  userId: number;
  displayName: string;
}

// Matches the confirmed 401 shape exactly: { error, timestamp, status }. Do not invent a
// different error contract (e.g. `message` instead of `error`) - this is the one that was
// actually verified against the live backend.
interface LoginErrorBody {
  error: string;
  timestamp?: string;
  status?: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as LoginErrorBody | null;
    throw new Error(body?.error ?? `Login failed (${res.status})`);
  }

  return res.json() as Promise<LoginResponse>;
}
