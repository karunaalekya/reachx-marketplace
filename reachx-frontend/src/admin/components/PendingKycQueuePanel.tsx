import { ArrowLeft } from "lucide-react";
import { useAdminKycStore } from "../store/useAdminKycStore";
import { PendingKycQueueList } from "./PendingKycQueueList";
import { VendorKycDocumentPanel } from "./VendorKycDocumentPanel";

interface PendingKycQueuePanelProps {
  authToken: string;
}

// Explicit mobile decision (the session plan flagged this as a call to make, not default):
// below `md`, this is single-pane - the vendor list, full width, until a vendor is selected,
// then the document checklist replaces it with a Back control. Desktop keeps the persistent
// split-pane (list left, checklist right) the blueprint specifies, so a reviewer never loses
// list context between documents. Not a horizontal-scrolling table either way - B1 is a list +
// detail, not a wide data table, so that specific failure mode doesn't apply here regardless.
export function PendingKycQueuePanel({ authToken }: PendingKycQueuePanelProps) {
  const selectedVendor = useAdminKycStore((s) => s.selectedVendor);
  const clearSelection = useAdminKycStore((s) => s.clearSelection);

  return (
    <div className="h-[calc(100vh-8rem)]">
      {/* Mobile: single pane, toggled by selection state. */}
      <div className="h-full md:hidden">
        {selectedVendor ? (
          <div className="flex h-full flex-col gap-3">
            <button
              type="button"
              onClick={clearSelection}
              className="flex min-h-11 w-fit items-center gap-2 rounded-md px-2 text-sm font-medium text-brand-indigo/70
                hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to queue
            </button>
            <div className="flex-1 overflow-hidden">
              <VendorKycDocumentPanel authToken={authToken} />
            </div>
          </div>
        ) : (
          <PendingKycQueueList authToken={authToken} />
        )}
      </div>

      {/* Desktop: persistent split-pane, per the blueprint's explicit spec against a
          modal-per-document approach - keeps the reviewer in one continuous flow. */}
      <div className="hidden h-full gap-6 md:grid md:grid-cols-[360px_1fr]">
        <PendingKycQueueList authToken={authToken} />
        <VendorKycDocumentPanel authToken={authToken} />
      </div>
    </div>
  );
}
