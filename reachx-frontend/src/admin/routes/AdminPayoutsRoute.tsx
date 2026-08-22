import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { AdminPayoutLedgerPanel } from "../components/AdminPayoutLedgerPanel";

export function AdminPayoutsRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <AdminPayoutLedgerPanel authToken={authToken} />;
}
