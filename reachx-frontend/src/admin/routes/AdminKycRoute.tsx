import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { AdminKycQueuePanel } from "../components/AdminKycQueuePanel";

export function AdminKycRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <AdminKycQueuePanel authToken={authToken} />;
}
