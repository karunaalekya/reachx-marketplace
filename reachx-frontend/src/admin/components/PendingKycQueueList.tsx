import { useEffect } from "react";
import { ShieldCheck, CheckCircle2 } from "lucide-react";
import { useAdminKycStore } from "../store/useAdminKycStore";
import { Pagination } from "../../shared/components/Pagination";
import type { VendorSummary } from "../api/adminKycApi";

interface PendingKycQueueListProps {
  authToken: string;
}

// Skeleton row count matches the default page size (see adminKycApi.listPendingKyc's size=20
// default) capped at a reasonable on-screen count - shimmer placeholders, not a full-page
// spinner, per the session plan's loading-state baseline.
const SKELETON_ROWS = 6;

export function PendingKycQueueList({ authToken }: PendingKycQueueListProps) {
  const { vendors, vendorsLoading, vendorsError, selectedVendor, fetchPendingVendors, selectVendor } =
    useAdminKycStore();

  useEffect(() => {
    fetchPendingVendors(authToken, 0);
    // Runs once on mount - re-fetching after each decision is handled inside the store's own
    // decideDocument action, not duplicated here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(vendor: VendorSummary) {
    selectVendor(vendor, authToken);
  }

  return (
    <div className="flex h-full flex-col rounded-lg bg-white shadow-premium-card">
      <div className="border-b border-brand-indigo/10 px-6 py-4">
        <h2 className="font-display text-lg text-brand-indigo">Pending KYC</h2>
        {vendors && (
          <p className="text-xs opacity-60">{vendors.totalElements} vendor{vendors.totalElements === 1 ? "" : "s"} awaiting review</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {vendorsLoading && (
          <ul className="space-y-3 p-4" aria-hidden="true">
            {Array.from({ length: SKELETON_ROWS }).map((_, i) => (
              <li key={i} className="h-16 animate-pulse rounded-md bg-brand-indigo/5" />
            ))}
          </ul>
        )}

        {vendorsError && (
          <div role="alert" className="m-4 rounded-md border-l-4 border-tint-chilli-border bg-tint-chilli-bg px-3 py-2 text-sm text-tint-chilli-text">
            {vendorsError}
          </div>
        )}

        {!vendorsLoading && !vendorsError && vendors?.empty && (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <CheckCircle2 size={28} className="text-tint-neem-border" aria-hidden="true" />
            <p className="text-sm opacity-60">No pending reviews — you're all caught up.</p>
          </div>
        )}

        {!vendorsLoading && !vendorsError && vendors && !vendors.empty && (
          <ul>
            {vendors.content.map((vendor) => {
              const isSelected = selectedVendor?.id === vendor.id;
              return (
                <li key={vendor.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(vendor)}
                    aria-current={isSelected ? "true" : undefined}
                    className={`flex w-full items-center gap-3 border-b border-brand-indigo/5 px-6 py-4 text-left transition
                      focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-indigo
                      ${isSelected ? "bg-brand-indigo/10" : "hover:bg-brand-indigo/5"}`}
                  >
                    <ShieldCheck
                      size={18}
                      className={`shrink-0 ${isSelected ? "text-brand-indigo" : "text-brand-indigo/30"}`}
                      aria-hidden="true"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-brand-indigo">{vendor.businessName}</p>
                      <p className="truncate text-xs opacity-60">{vendor.email}</p>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {vendors && !vendors.empty && (
        <Pagination
          page={vendors.number}
          totalPages={vendors.totalPages}
          first={vendors.first}
          last={vendors.last}
          disabled={vendorsLoading}
          onPageChange={(page) => fetchPendingVendors(authToken, page)}
        />
      )}
    </div>
  );
}
