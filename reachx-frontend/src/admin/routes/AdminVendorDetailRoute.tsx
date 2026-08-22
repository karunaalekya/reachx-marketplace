import { useOutletContext, useParams, Navigate } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { VendorManagementDetailPanel } from "../components/VendorManagementDetailPanel";

export function AdminVendorDetailRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  const { vendorId } = useParams<{ vendorId: string }>();
  const parsed = Number(vendorId);

  if (!vendorId || !Number.isInteger(parsed) || parsed <= 0) {
    return <Navigate to="/admin/vendors" replace />;
  }

  return <VendorManagementDetailPanel vendorId={parsed} authToken={authToken} />;
}
