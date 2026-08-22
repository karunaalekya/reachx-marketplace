import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { VendorInvoicesPanel } from "../components/VendorInvoicesPanel";

export function VendorInvoicesRoute() {
  const { authToken } = useOutletContext<VendorOutletContext>();
  return <VendorInvoicesPanel authToken={authToken} />;
}
