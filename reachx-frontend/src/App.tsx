import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./auth/store/useAuthStore";
import { LoginForm } from "./auth/components/LoginForm";
import { VendorDashboardShell } from "./vendor/layouts/VendorDashboardShell";
import { VendorHomeRoute } from "./vendor/routes/VendorHomeRoute";
import { VendorKycRoute } from "./vendor/routes/VendorKycRoute";
import { VendorPayoutsRoute } from "./vendor/routes/VendorPayoutsRoute";
import { VendorOrdersRoute } from "./vendor/routes/VendorOrdersRoute";
import { VendorDisputesRoute } from "./vendor/routes/VendorDisputesRoute";
import { VendorPlaceholderRoute } from "./vendor/routes/VendorPlaceholderRoute";
import { AdminConsolePlaceholder } from "./admin/AdminConsolePlaceholder";

// Real routing added this session, replacing the earlier state-based `activeSection` approach in
// VendorDashboardShell. That approach was a deliberate, documented choice at the time (see git
// history on this comment block) made because no storefront/admin route tree existed yet to
// justify the dependency. Both now do (or are about to, per ROADMAP.md session plan), so the
// original reason for deferring no longer holds - flagged then, addressed now, not silently
// added.
//
// Route shape:
//   /login              - public, redirects to /vendor if already authenticated
//   /vendor/*            - protected (RequireVendorAuth below), nested routes render inside
//                          VendorDashboardShell's <Outlet/> - deep-linkable now (e.g. /vendor/kyc
//                          survives a refresh/back-button, which the old useState never could)
//   /admin/*             - reserved, placeholder only - real admin console UI is next session's
//                          work per ROADMAP.md; this route exists now so that build doesn't need
//                          another routing migration on top of its own scope
//   /                    - redirects to /vendor for now; becomes the storefront root once that's
//                          built (not yet - see FRONTEND_STATE.md, storefront not started)
function RequireVendorAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  if (!token || userId === null) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}

function LoginRoute() {
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  if (token && userId !== null) {
    return <Navigate to="/vendor" replace />;
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
          <Route path="catalogue" element={<VendorPlaceholderRoute sectionKey="catalogue" />} />
          <Route path="invoices" element={<VendorPlaceholderRoute sectionKey="invoices" />} />
          <Route path="payments" element={<VendorPlaceholderRoute sectionKey="payments" />} />
          <Route path="refunds" element={<VendorPlaceholderRoute sectionKey="refunds" />} />
          <Route path="shipping" element={<VendorPlaceholderRoute sectionKey="shipping" />} />
        </Route>

        {/* Reserved for next session's build - not wired to any real UI yet. */}
        <Route path="/admin/*" element={<AdminConsolePlaceholder />} />

        {/* Storefront root doesn't exist yet - redirect to the only real surface for now. */}
        <Route path="/" element={<Navigate to="/vendor" replace />} />
        <Route path="*" element={<Navigate to="/vendor" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
