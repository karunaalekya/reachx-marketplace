import { Outlet, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import { ADMIN_NAV_ITEMS } from "../navConfig";

// Deliberately the same shell shape as vendor/layouts/VendorDashboardShell.tsx - same
// StaggerReveal choreography, same shadow/spacing tokens, same left-rail nav pattern - per
// PRESENT_POSITION_AND_DESIGN_DECISIONS.md 3i's "one consistent interaction language repeated
// across every module, not novelty per screen." An admin console with its own bespoke shell
// would be exactly the "novelty per screen" that section explicitly rejects.

export interface AdminOutletContext {
  adminId: number;
  displayName: string;
  authToken: string;
}

export function AdminConsoleShell() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const userId = useAuthStore((s) => s.userId);
  const displayName = useAuthStore((s) => s.displayName);

  // RequireAdminAuth (App.tsx) already guarantees token/userId/role==="ADMIN" before this
  // component ever mounts - same "safe to treat as definite here" reasoning
  // VendorDashboardShell.tsx uses for its own outlet context.
  const adminId = userId as number;
  const authToken = token as string;
  const adminDisplayName = displayName ?? "Admin";

  const outletContext: AdminOutletContext = { adminId, displayName: adminDisplayName, authToken };

  return (
    <div className="min-h-screen bg-surface-dashboard">
      <div className="flex">
        <StaggerReveal index={0} className="w-60 shrink-0">
          <nav
            aria-label="Admin console navigation"
            className="flex h-screen flex-col gap-1 border-r border-brand-indigo/10 bg-white p-4 shadow-premium-card"
          >
            <p className="mb-4 px-2 font-display text-lg text-brand-indigo">ReachX Admin</p>
            {ADMIN_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.key}
                  to={`/admin/${item.key === "home" ? "" : item.key}`}
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
                </NavLink>
              );
            })}
          </nav>
        </StaggerReveal>

        <div className="flex-1">
          <StaggerReveal index={1}>
            <header className="flex items-center justify-between border-b border-brand-indigo/10 bg-white px-8 py-4 shadow-premium-card">
              <div>
                <p className="text-xs uppercase tracking-wide opacity-50">Admin console</p>
                <p className="font-display text-lg text-brand-indigo">{adminDisplayName}</p>
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
