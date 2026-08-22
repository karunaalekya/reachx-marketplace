import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./auth/store/useAuthStore";
import { LoginForm } from "./auth/components/LoginForm";
import { VendorDashboardShell } from "./vendor/layouts/VendorDashboardShell";
import { VendorHomeRoute } from "./vendor/routes/VendorHomeRoute";
import { VendorKycRoute } from "./vendor/routes/VendorKycRoute";
import { VendorPayoutsRoute } from "./vendor/routes/VendorPayoutsRoute";
import { VendorOrdersRoute } from "./vendor/routes/VendorOrdersRoute";
import { VendorDisputesRoute } from "./vendor/routes/VendorDisputesRoute";
import { VendorProductsRoute } from "./vendor/routes/VendorProductsRoute";
import { VendorPlaceholderRoute } from "./vendor/routes/VendorPlaceholderRoute";
import { AdminConsoleShell } from "./admin/layouts/AdminConsoleShell";
import { AdminKycRoute } from "./admin/routes/AdminKycRoute";
import { AdminDisputesRoute } from "./admin/routes/AdminDisputesRoute";
import { AdminVendorsRoute } from "./admin/routes/AdminVendorsRoute";
import { AdminVendorDetailRoute } from "./admin/routes/AdminVendorDetailRoute";
import { AdminPayoutsRoute } from "./admin/routes/AdminPayoutsRoute";
import { AdminTaxRoute } from "./admin/routes/AdminTaxRoute";

// Route shape (this build = S8 vendor/catalogue work + Track B's full real admin console,
// merged together). Storefront (Track C) is deliberately NOT wired in yet - the session3 zip
// only contains checkout-flow files (CheckoutFormRoute, payments/orders API, Razorpay loader)
// and assumes StorefrontShell/ProductBrowseRoute/ProductDetailRoute/CartRoute/
// TrackOrderPlaceholderRoute/useCartStore/useProductBrowseStore/formatCurrency/indianStates
// already exist from Track C sessions 1-2, which haven't been provided. Once those are
// available, re-merge to add the storefront route tree back in (see merged-App.tsx from the
// prior pass for the intended shape) instead of hand-patching this file.
//   /login              - public, shared by vendor and admin logins, redirects by real `role`
//                          from the login response if already authenticated
//   /vendor/*            - protected to role === "VENDOR" (RequireVendorAuth below); a logged-in
//                          ADMIN hitting this directly is redirected to their own console.
//   /admin/*             - protected to role === "ADMIN" (RequireAdminAuth below). Every module
//                          real: kyc, disputes, vendors (+ vendors/:vendorId), payouts, tax.
//   /                    - temporary: redirects to /vendor, same as pre-merge behavior, until
//                          the real storefront root replaces this.
function RequireVendorAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  if (!token || userId === null) {
    return <Navigate to="/login" replace />;
  }
  if (role !== "VENDOR") {
    return <Navigate to="/admin" replace />;
  }
  return <>{children}</>;
}

function RequireAdminAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  if (!token || userId === null || role !== "ADMIN") {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  if (token && userId !== null) {
    return <Navigate to={role === "ADMIN" ? "/admin" : "/vendor"} replace />;
  }
  return (
    <div className="min-h-screen bg-surface-dashboard flex items-center justify-center p-8">
      <LoginForm />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginRoute />} />

        <Route
          path="/vendor"
          element={
            <RequireVendorAuth>
              <VendorDashboardShell />
            </RequireVendorAuth>
          }
        >
          <Route index element={<VendorHomeRoute />} />
          <Route path="kyc" element={<VendorKycRoute />} />
          <Route path="payouts" element={<VendorPayoutsRoute />} />
          <Route path="tax" element={<VendorPayoutsRoute />} />
          <Route path="orders" element={<VendorOrdersRoute />} />
          <Route path="disputes" element={<VendorDisputesRoute />} />
          <Route path="catalogue" element={<VendorProductsRoute />} />
          <Route path="invoices" element={<VendorPlaceholderRoute sectionKey="invoices" />} />
          <Route path="payments" element={<VendorPlaceholderRoute sectionKey="payments" />} />
          <Route path="refunds" element={<VendorPlaceholderRoute sectionKey="refunds" />} />
          <Route path="shipping" element={<VendorPlaceholderRoute sectionKey="shipping" />} />
        </Route>

        <Route
          path="/admin"
          element={
            <RequireAdminAuth>
              <AdminConsoleShell />
            </RequireAdminAuth>
          }
        >
          <Route index element={<Navigate to="kyc" replace />} />
          <Route path="kyc" element={<AdminKycRoute />} />
          <Route path="disputes" element={<AdminDisputesRoute />} />
          {/* No GET /vendors list-all endpoint is confirmed, so "vendors" is a by-id lookup
              screen, not a browsable table - see AdminVendorLookupPanel's own comment. */}
          <Route path="vendors" element={<AdminVendorsRoute />} />
          <Route path="vendors/:vendorId" element={<AdminVendorDetailRoute />} />
          <Route path="payouts" element={<AdminPayoutsRoute />} />
          <Route path="tax" element={<AdminTaxRoute />} />
        </Route>

        {/* Storefront not wired yet - see note above. Falls back to /vendor for now. */}
        <Route path="/" element={<Navigate to="/vendor" replace />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
