import { create } from "zustand";
import { login as loginRequest, type LoginResponse } from "../api/authApi";

// DELIBERATELY NOT wrapped in zustand/middleware's `persist` - the JWT never touches
// localStorage/sessionStorage. Same reasoning already on record for useVendorKycStore excluding
// `documents` (unencrypted, readable by any script on the origin, persists past logout).
//
// This session's honest gap, stated plainly rather than papered over: without persistence, a
// page refresh logs the vendor out - there is no silent session-restore. That's a real UX
// tradeoff, not an oversight; fixing it means either a real httpOnly-cookie refresh-token flow
// or an explicit short-lived encrypted-storage decision, neither of which is scoped into
// Session 2. Flag it for a real decision later, don't quietly reach for localStorage to make the
// symptom go away.
//
// Why in-memory over httpOnly cookie (the option named in the session brief): the confirmed
// login contract returns the JWT as a `token` field in the JSON response body, not via a
// Set-Cookie header - and the existing kycApi.ts (Session 1, untouched) already sends it back
// manually as `Authorization: Bearer <token>` on every request. A cookie-based backend wouldn't
// need to hand the token back in the body at all. This is inferred from the confirmed API
// contract and the already-real Bearer-header code, not from reading JwtService.java/
// SecurityConfig.java directly (not available in this session) - flagging that distinction
// rather than claiming a file read that didn't happen.
//
// Confirmed, not inferred: read AuthController/JwtService/AuthService directly from
// karunaalekya/reachx-marketplace this pass. AuthService#authenticateVendor issues
// `new LoginResponse(token, "VENDOR", vendor.getId(), vendor.getBusinessName())` and
// `JwtService.generateToken(vendor.getId(), ...)` - the same `vendor.getId()` is both the
// `userId` in the login response body AND the JWT subject that CurrentVendorArgumentResolver
// reads back out for every @CurrentVendor-annotated endpoint. For a VENDOR-role login, `userId`
// IS the vendor id - not an assumption, verified against the real source. (Note: this
// equivalence is VENDOR-specific - AuthService#authenticateAdmin issues `admin.getId()` as the
// same field for an ADMIN login, a different id space. Nothing in this frontend build does an
// ADMIN login, so this hasn't come up, but don't reuse `userId` as a vendor id after an ADMIN
// login without checking role first.)

interface AuthState {
  token: string | null;
  role: string | null;
  userId: number | null;
  displayName: string | null;
  isAuthenticating: boolean;
  error: string | null;

  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  token: null,
  role: null,
  userId: null,
  displayName: null,
  isAuthenticating: false,
  error: null,

  login: async (email, password) => {
    set({ isAuthenticating: true, error: null });
    try {
      const res: LoginResponse = await loginRequest({ email, password });
      set({
        token: res.token,
        role: res.role,
        userId: res.userId,
        displayName: res.displayName,
        isAuthenticating: false,
      });
      return true;
    } catch (err) {
      set({
        isAuthenticating: false,
        error: err instanceof Error ? err.message : "Login failed.",
      });
      return false;
    }
  },

  logout: () => set({ token: null, role: null, userId: null, displayName: null, error: null }),
}));
