import { ShieldCheck, AlertTriangle, Users, Wallet, Receipt, type LucideIcon } from "lucide-react";

// Mirrors vendor/navConfig.ts's shape and its "only modules with a real backend endpoint behind
// them" rule. `built` reflects what each Track B session actually ships, updated session by
// session - not all flipped true up front.

export type AdminSectionKey = "kyc" | "disputes" | "vendors" | "payouts" | "tax";

export interface AdminNavItem {
  key: AdminSectionKey;
  label: string;
  icon: LucideIcon;
  built: boolean;
  sessionNote: string;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { key: "kyc", label: "KYC Queue", icon: ShieldCheck, built: true, sessionNote: "" },
  { key: "disputes", label: "Disputes", icon: AlertTriangle, built: true, sessionNote: "" },
  { key: "vendors", label: "Vendors", icon: Users, built: true, sessionNote: "" },
  { key: "payouts", label: "Payouts", icon: Wallet, built: true, sessionNote: "" },
  { key: "tax", label: "Tax Reports", icon: Receipt, built: true, sessionNote: "" },
];
