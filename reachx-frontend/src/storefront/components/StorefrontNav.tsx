import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { Home, ShoppingCart, PackageSearch, Search } from "lucide-react";
import { useCartStore, selectItemCount } from "../store/useCartStore";

// Mobile nav decision (called out in the session plan as needing to be made in Session 1,
// before routing structure is set - it affects every later screen): bottom tab bar, not
// hamburger-only. Reasoning: this is a browse-and-buy storefront, not a settings-heavy admin
// surface (that's the vendor dashboard's sidebar, which stays as-is) - a persistent bottom bar
// keeps Home/Cart/Track Order one tap away throughout checkout, matching the standard Indian
// e-commerce mobile pattern (Flipkart/Amazon/Myntra) rather than burying them behind a menu icon.
// Desktop keeps the same three destinations in a top header instead of duplicating the bar,
// since there's no space constraint forcing a collapse there.

const TAB_ITEMS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/cart", label: "Cart", icon: ShoppingCart, end: false },
  { to: "/track-order", label: "Track Order", icon: PackageSearch, end: false },
] as const;

interface StorefrontNavProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  showSearch: boolean;
}

// Cart badge - reserved-but-unused since Session 1's tailwind.config.js merge
// ("badge-pulse... stays defined-but-unused until the cart badge exists (C2)"). Remounting on
// `pulseKey` change (rather than toggling a class) forces the animation to replay every time the
// count goes up, including repeated add-to-cart clicks on the same render. motion-safe: prefix
// keeps this off entirely under prefers-reduced-motion, same discipline as the skeleton shimmer.
function CartBadge({ count, pulseKey }: { count: number; pulseKey: number }) {
  if (count <= 0) return null;
  return (
    <span
      key={pulseKey}
      aria-hidden="true"
      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full
        bg-brand-saffron px-1 text-[10px] font-bold leading-none text-white motion-safe:animate-badge-pulse"
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function StorefrontNav({ searchValue, onSearchChange, onSearchSubmit, showSearch }: StorefrontNavProps) {
  const cartItemCount = useCartStore((s) => selectItemCount(s.items));
  const prevCountRef = useRef(cartItemCount);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    if (cartItemCount > prevCountRef.current) {
      setPulseKey((k) => k + 1);
    }
    prevCountRef.current = cartItemCount;
  }, [cartItemCount]);

  return (
    <>
      {/* Top header - all breakpoints. */}
      <header className="sticky top-0 z-40 border-b border-brand-indigo/10 bg-surface-storefront/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <NavLink to="/" className="shrink-0 font-display text-lg font-bold text-brand-indigo">
            ReachX
          </NavLink>

          {showSearch && (
            <form
              role="search"
              onSubmit={(e) => {
                e.preventDefault();
                onSearchSubmit();
              }}
              className="flex-1"
            >
              <label htmlFor="storefront-search" className="sr-only">
                Search products
              </label>
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="storefront-search"
                  type="search"
                  value={searchValue}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search products"
                  className="w-full rounded-md border border-brand-indigo/15 bg-white py-2 pl-9 pr-3 text-sm
                    text-brand-indigo placeholder:text-slate-400
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
                />
              </div>
            </form>
          )}

          {/* Desktop-only inline destinations - mobile relies on the bottom tab bar instead of
              duplicating these here, so this row doesn't fight the fixed bottom bar for thumb reach. */}
          <nav aria-label="Storefront navigation" className="ml-auto hidden items-center gap-1 sm:flex">
            {TAB_ITEMS.slice(1).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    `relative flex min-h-[44px] items-center gap-2 rounded-md px-3 text-sm font-medium transition
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron
                    ${isActive ? "bg-brand-indigo/10 text-brand-indigo" : "text-slate-500 hover:text-brand-indigo"}`
                  }
                >
                  <span className="relative inline-flex">
                    <Icon size={18} aria-hidden="true" />
                    {item.to === "/cart" && <CartBadge count={cartItemCount} pulseKey={pulseKey} />}
                  </span>
                  {item.label}
                  {item.to === "/cart" && cartItemCount > 0 && (
                    <span className="sr-only">, {cartItemCount} items</span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Bottom tab bar - mobile only. */}
      <nav
        aria-label="Storefront navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-brand-indigo/10 bg-white/95 backdrop-blur sm:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {TAB_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex min-h-[52px] flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-saffron
                ${isActive ? "text-brand-saffron" : "text-slate-500"}`
              }
            >
              <span className="relative inline-flex">
                <Icon size={20} aria-hidden="true" />
                {item.to === "/cart" && <CartBadge count={cartItemCount} pulseKey={pulseKey} />}
              </span>
              {item.label}
              {item.to === "/cart" && cartItemCount > 0 && (
                <span className="sr-only">, {cartItemCount} items</span>
              )}
            </NavLink>
          );
        })}
      </nav>
    </>
  );
}
