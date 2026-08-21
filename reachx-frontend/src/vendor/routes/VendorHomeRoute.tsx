import { useOutletContext, useNavigate } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { ActionCenterCard } from "../components/ActionCenterCard";

// Thin route wrapper - identity comes from the shell's <Outlet context/> (set once in
// VendorDashboardShell from useAuthStore) rather than this route re-reading the auth store
// itself, keeping ActionCenterCard's own props unchanged from before the routing migration.
export function VendorHomeRoute() {
  const { vendorId, businessName, authToken } = useOutletContext<VendorOutletContext>();
  const navigate = useNavigate();

  return (
    <ActionCenterCard
      vendorId={vendorId}
      businessName={businessName}
      authToken={authToken}
      onNavigateToKyc={() => navigate("/vendor/kyc")}
    />
  );
}
