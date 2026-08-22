import { useOutletContext } from "react-router-dom";
import type { AdminOutletContext } from "../layouts/AdminConsoleShell";
import { AdminTaxWithholdingPanel } from "../components/AdminTaxWithholdingPanel";

export function AdminTaxRoute() {
  const { authToken } = useOutletContext<AdminOutletContext>();
  return <AdminTaxWithholdingPanel authToken={authToken} />;
}
