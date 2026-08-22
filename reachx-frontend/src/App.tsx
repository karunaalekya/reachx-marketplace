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
import { AdminHomeRoute } from "./admin/routes/AdminHomeRoute";
import { AdminKycRoute } from "./admin/routes/AdminKycRoute";
import { AdminDisputesRoute } from "./admin/routes/AdminDisputesRoute";
import { AdminTaxRoute } from "./admin/routes/AdminTaxRoute";

// Route shape (updated this session - Session 8):
//   /login              - public, shared by both vendor and admin logins, redirects by real
//                          `role` if already authenticated (see LoginRoute below)
//   /vendor/*            - protected to role === "VENDOR", nested routes render inside
//                          VendorDashboardShell's <Outlet/>
//   /admin/*             - protected to role === "ADMIN", nested routes render inside
//                          AdminConsoleShell's <Outlet/> - real UI as of this session, replacing
//                          the placeholder reserved-route stub from the prior session
//   /                    - redirects to /vendor for now; becomes the storefront root once that's
//                          built (not yet - see FRONTEND_STATE.md, storefront not started)
//
// Role-gating tightened this session: RequireVendorAuth/RequireAdminAuth previously (session
// that added routing) only checked token/userId were non-null, not the actual `role` string from
// the login response. That was a real, named risk on record even then - useAuthStore.ts's own
// comment warns "don't reuse userId as a vendor id after an ADMIN login without checking role
// first" - but it stayed theoretical while no admin-facing route existed for an admin login to
// reach. Now that /admin/* has real UI behind it, the same gap runs both directions (an admin
// account could land in /vendor treating its own id as a vendor id, or a vendor could land in
// /admin with nothing to actually call since every admin-only endpoint would 403). Both guards
// below now check `role` explicitly instead of just presence of a token.

function RequireVendorAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  if (!token || userId === null || role !== "VENDOR") {
    return <Navigate to="/login" replace />;
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
          <Route index element={<AdminHomeRoute />} />
          <Route path="kyc" element={<AdminKycRoute />} />
          <Route path="disputes" element={<AdminDisputesRoute />} />
          <Route path="tax" element={<AdminTaxRoute />} />
        </Route>

        {/* Storefront root doesn't exist yet - redirect to the only real surface for now. */}
        <Route path="/" element={<Navigate to="/vendor" replace />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
