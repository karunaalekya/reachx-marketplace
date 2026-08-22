import { ADMIN_NAV_ITEMS, type AdminSectionKey } from "../navConfig";
import { ModulePlaceholder } from "../../vendor/layouts/ModulePlaceholder";

// Reuses the vendor side's ModulePlaceholder component directly - it's generic (icon/label/
// sessionNote props only, no vendor-specific logic), so this is one honest "not built yet"
// screen shared across both dashboards, not a duplicated copy.

interface AdminPlaceholderRouteProps {
  sectionKey: AdminSectionKey;
}

export function AdminPlaceholderRoute({ sectionKey }: AdminPlaceholderRouteProps) {
  const item = ADMIN_NAV_ITEMS.find((i) => i.key === sectionKey);
  if (!item) return null;
  return <ModulePlaceholder icon={item.icon} label={item.label} sessionNote={item.sessionNote} />;
}
