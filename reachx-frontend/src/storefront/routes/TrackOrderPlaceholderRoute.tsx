import { PackageSearch } from "lucide-react";
import { StorefrontPlaceholder } from "../components/StorefrontPlaceholder";

export function TrackOrderPlaceholderRoute() {
  return (
    <StorefrontPlaceholder
      icon={PackageSearch}
      label="Track Order"
      sessionNote="Guest order lookup, per-vendor invoice + shipment tracking, and raising a dispute all arrive later (C4/C5) once checkout (C3) exists to actually produce an order to look up."
    />
  );
}
