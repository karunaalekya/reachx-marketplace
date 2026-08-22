import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { ProductsPanel } from "../components/ProductsPanel";

export function VendorProductsRoute() {
  const { vendorId, authToken } = useOutletContext<VendorOutletContext>();
  return <ProductsPanel vendorId={vendorId} authToken={authToken} />;
}
