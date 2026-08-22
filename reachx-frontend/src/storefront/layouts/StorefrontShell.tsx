import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { StorefrontNav } from "../components/StorefrontNav";
import { OperationToast } from "../../shared/components/OperationToast";
import { useToasts } from "../../shared/hooks/useToasts";
import { useProductBrowseStore } from "../store/useProductBrowseStore";

// Session 1 only needed a single hardcoded toast (pushCartStubToast) since nothing was wired
// yet. Session 2 wires real actions (add to cart, checkout submit) that each need their own
// toast copy, so the outlet context now exposes the underlying `pushToast` itself instead of one
// baked-in call - same toast system (`useToasts`/`OperationToast`), reused not rebuilt, per the
// plan's cross-cutting requirement.
//
// ToastVariant is inferred from the one real call site Session 1 left behind
// (`pushToast("saffron", "Cart isn't wired up yet", ...)`) and the tint-token naming already
// used elsewhere in this codebase (`tint.{neem,chilli,saffron,muted}`). `useToasts.ts` itself
// isn't part of this session's diff - confirm this type actually matches its real signature
// before relying on it for anything stricter than what's used below.
export type ToastVariant = "saffron" | "neem" | "chilli";

export interface StorefrontOutletContext {
  pushToast: (variant: ToastVariant, title: string, message?: string) => void;
}

export function StorefrontShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toasts, pushToast, dismissToast } = useToasts();
  const setFilters = useProductBrowseStore((s) => s.setFilters);
  const filters = useProductBrowseStore((s) => s.filters);
  const fetchProducts = useProductBrowseStore((s) => s.fetchProducts);
  const [searchDraft, setSearchDraft] = useState(filters.q ?? "");

  // Search only makes sense on the browse grid itself - hidden on PDP/cart/checkout/track-order
  // rather than shown everywhere and doing nothing there.
  const showSearch = location.pathname === "/";

  function handleSearchSubmit() {
    setFilters({ ...filters, q: searchDraft || undefined });
    if (location.pathname !== "/") {
      navigate("/");
    }
    fetchProducts(0);
  }

  return (
    <div className="min-h-screen bg-surface-storefront pb-16 sm:pb-0">
      <StorefrontNav
        searchValue={searchDraft}
        onSearchChange={setSearchDraft}
        onSearchSubmit={handleSearchSubmit}
        showSearch={showSearch}
      />
      <main className="mx-auto max-w-6xl px-4 py-6">
        <Outlet context={{ pushToast } satisfies StorefrontOutletContext} />
      </main>
      {toasts.map((t) => (
        <OperationToast key={t.id} {...t} onClose={dismissToast} />
      ))}
    </div>
  );
}
