import {
  Home,
  ShieldCheck,
  Wallet,
  Receipt,
  Package,
  Boxes,
  FileText,
  CreditCard,
  AlertTriangle,
  RotateCcw,
  Truck,
  type LucideIcon,
} from "lucide-react";

// Extracted from VendorDashboardShell.tsx during the react-router migration - was previously
// a local const only the shell needed (it owned all section rendering via useState). Now that
// each section is its own route (App.tsx), VendorPlaceholderRoute.tsx needs this same
// icon/label/sessionNote data too, so it lives here instead of being duplicated or requiring a
// route file to import from the layout component.
export type SectionKey =
  | "home"
  | "kyc"
  | "payouts"
  | "tax"
  | "orders"
  | "catalogue"
  | "invoices"
  | "payments"
  | "disputes"
  | "refunds"
  | "shipping";

export interface NavItem {
  key: SectionKey;
  label: string;
  icon: LucideIcon;
  built: boolean;
  sessionNote: string;
}

// Nav scoped ONLY to modules with a real backend endpoint behind them - the sidebar/IA decision
// in PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3g. Insights/Recommendations are cut entirely,
// not just deferred, because nothing in the backend supports them. `built` reflects what each
// session actually shipped - lucide icons throughout, closes FRONTEND_STATE.md issue #8.
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", icon: Home, built: true, sessionNote: "" },
  { key: "kyc", label: "Verification", icon: ShieldCheck, built: true, sessionNote: "" },
  { key: "payouts", label: "Payouts", icon: Wallet, built: true, sessionNote: "" },
  { key: "tax", label: "Tax", icon: Receipt, built: true, sessionNote: "" },
  { key: "orders", label: "Orders", icon: Package, built: true, sessionNote: "" },
  {
    key: "catalogue",
    label: "Catalogue",
    icon: Boxes,
    built: false,
    sessionNote: "Product CRUD and stock management - backend ProductController is live and untouched by any frontend UI yet. Next session's #1 priority per the storefront/catalogue build plan.",
  },
  {
    key: "invoices",
    label: "Invoices",
    icon: FileText,
    built: false,
    sessionNote: "Invoice list and download - backend InvoiceController (GST invoice generation) is live and untouched by any frontend UI yet.",
  },
  {
    key: "payments",
    label: "Payments",
    icon: CreditCard,
    built: false,
    sessionNote: "Payment status display - backend PaymentController is live and untouched by any frontend UI yet. Read-only, gateway-webhook-driven.",
  },
  { key: "disputes", label: "Disputes", icon: AlertTriangle, built: true, sessionNote: "" },
  {
    key: "refunds",
    label: "Refunds",
    icon: RotateCcw,
    built: false,
    sessionNote: "Refund status display - deferred, no dedicated frontend view planned yet.",
  },
  {
    key: "shipping",
    label: "Shipping",
    icon: Truck,
    built: false,
    sessionNote: "Shipment tracking is shown inline within Orders - see OrdersPanel.tsx. This standalone view stays deferred; nothing here would add beyond what Orders already shows.",
  },
];
