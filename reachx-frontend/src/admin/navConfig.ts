import { Home, ShieldCheck, AlertTriangle, Receipt, ShieldAlert, type LucideIcon } from "lucide-react";

// Icon choices deliberately limited to names already confirmed present in this exact
// lucide-react version elsewhere in this codebase (vendor/navConfig.ts, AdminConsolePlaceholder,
// DisputesPanel) rather than reaching for a more literal icon (a gavel, a person-cog) that this
// session has no way to verify exists in 0.383.0 without npm/registry access - see
// FRONTEND_STATE.md's Session 8 network-access caveat.

// Mirrors vendor/navConfig.ts's shape and its "only real backend endpoints get a nav item"
// discipline (PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3g). Vendor suspend/reactivate is left
// out entirely rather than added as a `built: false` placeholder item pointing nowhere real -
// AdminHomeRoute names it as known-available-but-out-of-scope instead, since the session plan
// (3h, row 8) scoped this session to KYC/dispute/tax admin views only.
export type AdminSectionKey = "home" | "kyc" | "disputes" | "tax";

export interface AdminNavItem {
  key: AdminSectionKey;
  label: string;
  icon: LucideIcon;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: "home", label: "Home", icon: Home },
  { key: "kyc", label: "KYC queue", icon: ShieldCheck },
  { key: "disputes", label: "Disputes", icon: AlertTriangle },
  { key: "tax", label: "Tax", icon: Receipt },
];

// Not a nav item (no screen behind it yet) - referenced by AdminHomeRoute to describe what's
// known live but unbuilt, same honest-gap pattern as vendor/navConfig.ts's `built: false` items.
export const VENDOR_LIFECYCLE_ICON: LucideIcon = ShieldAlert;
