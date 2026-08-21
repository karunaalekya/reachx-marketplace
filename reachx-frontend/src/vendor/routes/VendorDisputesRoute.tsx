import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { DisputesPanel } from "../components/DisputesPanel";

export function VendorDisputesRoute() {
  const { vendorId, authToken } = useOutletContext<VendorOutletContext>();
  return <DisputesPanel vendorId={vendorId} authToken={authToken} />;
}
