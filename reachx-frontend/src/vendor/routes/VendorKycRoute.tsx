import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { KycVerificationPanel } from "../components/KycVerificationPanel";

export function VendorKycRoute() {
  const { vendorId, businessName, authToken } = useOutletContext<VendorOutletContext>();
  return <KycVerificationPanel vendorId={vendorId} businessName={businessName} authToken={authToken} />;
}
