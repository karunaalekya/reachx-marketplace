import { ArrowLeft } from "lucide-react";
import { useAdminDisputesStore } from "../store/useAdminDisputesStore";
import { DisputeQueueList } from "./DisputeQueueList";
import { DisputeDetailPanel } from "./DisputeDetailPanel";

interface AdminDisputeQueuePanelProps {
  authToken: string;
}

// Same responsive split-pane decision as PendingKycQueuePanel.tsx (Session 1): below `md`,
// single pane toggled by selection with a Back control; desktop keeps the persistent split-pane.
// Not a horizontal-scrolling table either way, same reasoning as B1.
export function AdminDisputeQueuePanel({ authToken }: AdminDisputeQueuePanelProps) {
  const selectedDispute = useAdminDisputesStore((s) => s.selectedDispute);
  const clearSelection = useAdminDisputesStore((s) => s.clearSelection);

  return (
    <div className="h-[calc(100vh-8rem)]">
      <div className="h-full md:hidden">
        {selectedDispute ? (
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
              <DisputeDetailPanel authToken={authToken} />
            </div>
          </div>
        ) : (
          <DisputeQueueList authToken={authToken} />
        )}
      </div>

      <div className="hidden h-full gap-6 md:grid md:grid-cols-[360px_1fr]">
        <DisputeQueueList authToken={authToken} />
        <DisputeDetailPanel authToken={authToken} />
      </div>
    </div>
  );
}
