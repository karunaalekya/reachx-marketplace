import { ShieldAlert } from "lucide-react";

// Reserved route only - the backend already has live, tested admin endpoints (KYC document
// decision, dispute resolve, vendor suspend/reactivate - see BACKEND_STATUS.md) with zero
// frontend built against them yet. That's next session's scope, not this one (this session's
// scope was react-router only, see App.tsx's routing comment). Reserving /admin/* now means
// that build won't need its own routing migration on top of its actual work.
export function AdminConsolePlaceholder() {
  return (
    <div className="min-h-screen bg-surface-dashboard flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
        <ShieldAlert size={32} className="text-brand-indigo/30" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Admin console</p>
        <p className="max-w-sm text-sm opacity-60">
          Not built yet. Backend admin endpoints (KYC decision, dispute resolve, vendor
          suspend/reactivate) are live - this route is reserved for that session's build.
        </p>
      </div>
    </div>
  );
}
