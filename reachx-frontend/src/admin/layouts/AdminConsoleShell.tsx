import { Outlet, NavLink } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuthStore } from "../../auth/store/useAuthStore";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import { ADMIN_NAV_ITEMS } from "../navConfig";

// Mirrors vendor/layouts/VendorDashboardShell.tsx's structure deliberately - same sidebar/
// header/main layout, same StaggerReveal choreography, same NavLink active-state styling. Track
// B is a second dashboard, not a second design system - per the master blueprint's explicit
// instruction not to invent parallel tokens/components.

export interface AdminOutletContext {
  authToken: string;
  displayName: string;
}

export function AdminConsoleShell() {
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const displayName = useAuthStore((s) => s.displayName);

  // RequireAdminAuth (App.tsx) already guarantees token is non-null and role === "ADMIN"
  // before this component ever mounts.
  const authToken = token as string;
  const adminName = displayName ?? "Admin";

  const outletContext: AdminOutletContext = { authToken, displayName: adminName };

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
                  to={`/admin/${item.key}`}
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
                <p className="text-xs uppercase tracking-wide opacity-50">Admin console</p>
                <p className="font-display text-lg text-brand-indigo">{adminName}</p>
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

          {/* max-w-6xl, wider than the vendor shell's max-w-4xl - the KYC split-pane needs the
              extra width for list + document checklist to sit side by side without cramping,
              and later admin tables (payouts, disputes) will need it too. */}
          <main className="mx-auto max-w-6xl space-y-6 p-8">
            <StaggerReveal index={2}>
              <Outlet context={outletContext} />
            </StaggerReveal>
          </main>
        </div>
      </div>
    </div>
  );
}
