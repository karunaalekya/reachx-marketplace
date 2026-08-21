import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { OrdersPanel } from "../components/OrdersPanel";

export function VendorOrdersRoute() {
  const { vendorId, authToken } = useOutletContext<VendorOutletContext>();
  return <OrdersPanel vendorId={vendorId} authToken={authToken} />;
}
