import { NAV_ITEMS, type SectionKey } from "../navConfig";
import { ModulePlaceholder } from "../layouts/ModulePlaceholder";

interface VendorPlaceholderRouteProps {
  sectionKey: SectionKey;
}

// One route element registered per not-yet-built nav section (catalogue/invoices/payments/
// refunds/shipping in App.tsx) - looks up its own icon/label/sessionNote from the shared
// navConfig instead of each duplicating that data inline.
export function VendorPlaceholderRoute({ sectionKey }: VendorPlaceholderRouteProps) {
  const item = NAV_ITEMS.find((i) => i.key === sectionKey);
  if (!item) return null;
  return <ModulePlaceholder icon={item.icon} label={item.label} sessionNote={item.sessionNote} />;
}
