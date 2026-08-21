import { useOutletContext } from "react-router-dom";
import type { VendorOutletContext } from "../layouts/VendorDashboardShell";
import { VendorPayoutLedger } from "../components/VendorPayoutLedger";

// Registered at both /vendor/payouts and /vendor/tax in App.tsx - same component renders both,
// exactly matching the pre-routing behavior (VendorPayoutLedger already renders the FY tax-totals
// card plus the ledger table in one place; see that file's own header comment for why Tax was
// never split into a separate data source).
export function VendorPayoutsRoute() {
  const { vendorId, authToken } = useOutletContext<VendorOutletContext>();
  return <VendorPayoutLedger vendorId={vendorId} authToken={authToken} />;
}
