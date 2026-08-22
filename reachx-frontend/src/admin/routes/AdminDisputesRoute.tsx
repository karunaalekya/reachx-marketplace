import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { AdminDisputeQueuePanel } from "../components/AdminDisputeQueuePanel";

export function AdminDisputesRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <AdminDisputeQueuePanel authToken={authToken} />;
}
