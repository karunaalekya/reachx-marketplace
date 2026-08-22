import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { PendingKycQueuePanel } from "../components/PendingKycQueuePanel";

export function AdminKycRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <PendingKycQueuePanel authToken={authToken} />;
}
