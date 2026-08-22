import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { AdminDisputeResolutionPanel } from "../components/AdminDisputeResolutionPanel";

export function AdminDisputesRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <AdminDisputeResolutionPanel authToken={authToken} />;
}
