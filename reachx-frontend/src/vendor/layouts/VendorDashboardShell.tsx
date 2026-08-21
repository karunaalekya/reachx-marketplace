import { Outlet, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { useVendorKycStore } from "../store/useVendorStore";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import { NAV_ITEMS } from "../navConfig";

// Passed down to every nested route via <Outlet context={...}/> + useOutletContext() in each
// route wrapper (src/vendor/routes/*.tsx), rather than each panel importing useAuthStore
// directly - keeps the panels themselves agnostic of *how* identity got here, same reasoning
// props-drilling served before, just delivered via the router's own context mechanism instead
// of JSX props now that routing owns the tree shape.
export interface VendorOutletContext {
  vendorId: number;
  businessName: string;
  authToken: string;
}

export function VendorDashboardShell() {
  const logout = useAuthStore((s) => s.logout);
  const fetchKycDocuments = useVendorKycStore((s) => s.fetchKycDocuments);
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const displayName = useAuthStore((s) => s.displayName);

  // RequireVendorAuth (App.tsx) already guarantees token/userId are non-null before this
  // component ever mounts - these are safe to treat as definite here, not re-guarded.
  const vendorId = userId as number;
  const authToken = token as string;
  const businessName = displayName ?? "Vendor";

  // Session 2 goal: cached overallKycStatus self-corrects instead of going stale after a
  // server-side admin decision made in another tab/session. Re-fetches whenever the tab regains
  // focus, not just on mount.
  useRefetchOnFocus(() => fetchKycDocuments(authToken));

  const outletContext: VendorOutletContext = { vendorId, businessName, authToken };

  return (
    <div className="min-h-screen bg-surface-dashboard">
      <div className="flex">
        <StaggerReveal index={0} className="w-60 shrink-0">
          <nav
            aria-label="Vendor dashboard navigation"
            className="flex h-screen flex-col gap-1 border-r border-brand-indigo/10 bg-white p-4 shadow-premium-card"
          >
            <p className="mb-4 px-2 font-display text-lg text-brand-indigo">ReachX</p>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={`/vendor/${item.key === "home" ? "" : item.key}`}
                  end={item.key === "home"}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition
                    focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo
                    ${isActive
                      ? "bg-brand-indigo/10 text-brand-indigo"
                      : "text-brand-indigo/60 hover:bg-brand-indigo/5"}`
                  }
                >
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                  {!item.built && <span className="ml-auto text-[10px] opacity-50">soon</span>}
                </NavLink>
              );
            })}
          </nav>
        </StaggerReveal>

        <div className="flex-1">
          <StaggerReveal index={1}>
            <header className="flex items-center justify-between border-b border-brand-indigo/10 bg-white px-8 py-4 shadow-premium-card">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-50">Vendor dashboard</p>
                <p className="font-display text-lg text-brand-indigo">{businessName}</p>
              </div>
              <button
                type="button"
                onClick={logout}
                className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-brand-indigo/70 hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
              >
                <LogOut size={16} aria-hidden="true" />
                Sign out
              </button>
            </header>
          </StaggerReveal>

          {/* max-w-4xl, not the original 3xl - the payout ledger's row (order info + net amount +
              status badge + chevron) needs the extra width to not cramp the status badge against
              the amount. Home/KYC read fine at this width too, so this isn't section-specific. */}
          <main className="mx-auto max-w-4xl space-y-6 p-8">
            <StaggerReveal index={2}>
              <Outlet context={outletContext} />
            </StaggerReveal>
          </main>
        </div>
      </div>
    </div>
  );
}
