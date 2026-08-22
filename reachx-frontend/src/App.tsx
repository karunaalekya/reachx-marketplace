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
import { VendorInvoicesRoute } from "./vendor/routes/VendorInvoicesRoute";
import { VendorPlaceholderRoute } from "./vendor/routes/VendorPlaceholderRoute";
import { AdminConsoleShell } from "./admin/layouts/AdminConsoleShell";
import { AdminKycRoute } from "./admin/routes/AdminKycRoute";
import { AdminDisputesRoute } from "./admin/routes/AdminDisputesRoute";
import { AdminVendorsRoute } from "./admin/routes/AdminVendorsRoute";
import { AdminVendorDetailRoute } from "./admin/routes/AdminVendorDetailRoute";
import { AdminPayoutsRoute } from "./admin/routes/AdminPayoutsRoute";
import { AdminTaxRoute } from "./admin/routes/AdminTaxRoute";
import { StorefrontShell } from "./storefront/layouts/StorefrontShell";
import { ProductBrowseRoute } from "./storefront/routes/ProductBrowseRoute";
import { ProductDetailRoute } from "./storefront/routes/ProductDetailRoute";
import { CartRoute } from "./storefront/routes/CartRoute";
import { CheckoutFormRoute } from "./storefront/routes/CheckoutFormRoute";
import { TrackOrderPlaceholderRoute } from "./storefront/routes/TrackOrderPlaceholderRoute";

// Route shape (final merge - S8 vendor/catalogue + Track B real admin console + Track C
// storefront sessions 1-3 assembled together, each superseding the last: session1 stub ->
// session2 real cart -> session3 real checkout/Razorpay):
//   /login              - public, shared by vendor and admin logins, redirects by real `role`
//                          from the login response if already authenticated
//   /vendor/*            - protected to role === "VENDOR" (RequireVendorAuth below); a logged-in
//                          ADMIN hitting this directly is redirected to their own console.
//   /admin/*             - protected to role === "ADMIN" (RequireAdminAuth below). Every module
//                          real: kyc, disputes, vendors (+ vendors/:vendorId), payouts, tax.
//   /                    - storefront root (public, no auth wrapper - guest-only checkout by
//                          backend design), product grid
//   /product/:id         - product detail page
//   /cart                - real cart
//   /checkout            - real checkout: POST /orders, POST /payments/orders/{id}/initiate
//                          (Razorpay), processing/success/fail phases
//   /track-order         - still a placeholder; guest order lookup/tracking is future work
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
          <Route path="invoices" element={<VendorInvoicesRoute />} />
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
          <Route path="vendors" element={<AdminVendorsRoute />} />
          <Route path="vendors/:vendorId" element={<AdminVendorDetailRoute />} />
          <Route path="payouts" element={<AdminPayoutsRoute />} />
          <Route path="tax" element={<AdminTaxRoute />} />
        </Route>

        {/* Storefront - public, no auth wrapper at all (guest-only checkout by backend design). */}
        <Route path="/" element={<StorefrontShell />}>
          <Route index element={<ProductBrowseRoute />} />
          <Route path="product/:id" element={<ProductDetailRoute />} />
          <Route path="cart" element={<CartRoute />} />
          <Route path="checkout" element={<CheckoutFormRoute />} />
          <Route path="track-order" element={<TrackOrderPlaceholderRoute />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
