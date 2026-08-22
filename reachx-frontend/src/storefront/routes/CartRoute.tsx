import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { useCartStore, selectGroupedByVendor, selectSubtotal } from "../store/useCartStore";
import { formatCurrency } from "../utils/formatCurrency";

// Replaces CartPlaceholderRoute.tsx this session - delete that file, it's fully superseded.

export function CartRoute() {
  const navigate = useNavigate();
  const items = useCartStore((s) => s.items);
  const setQuantity = useCartStore((s) => s.setQuantity);
  const removeItem = useCartStore((s) => s.removeItem);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
        <ShoppingCart size={32} className="text-brand-indigo/30" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Your cart is empty — explore products.</p>
        <Link
          to="/"
          className="mt-2 inline-flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-semibold text-white
            hover:bg-brand-indigo/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo"
        >
          Start browsing
        </Link>
      </div>
    );
  }

  const groups = selectGroupedByVendor(items);
  const subtotal = selectSubtotal(items);

  return (
    <div className="space-y-6 pb-28 sm:pb-6">
      <h1 className="font-display text-2xl font-bold text-brand-indigo">Your Cart</h1>

      {/* Vendor-grouped sections - the plan's "most important storefront design decision":
          a customer needs to understand pre-checkout that one order may ship as several
          independent vendor consignments, not one merged list. */}
      <div className="space-y-5">
        {groups.map((group) => (
          <section
            key={group.vendorId}
            className="overflow-hidden rounded-lg border border-brand-indigo/10 bg-white shadow-premium-card"
          >
            <header className="flex items-center justify-between border-b border-brand-indigo/10 bg-surface-cardMuted px-4 py-2.5">
              <p className="text-xs font-semibold text-slate-500">Seller #{group.vendorId}</p>
              <p className="text-xs font-semibold text-slate-500">
                Subtotal:{" "}
                <span
                  className="text-brand-indigo"
                  // A vendor group with exactly one line item has its per-line total (below,
                  // in the item row) coincidentally equal to this vendor subtotal - both render
                  // the same formatted currency string in that case, so a plain text query
                  // can't tell them apart. data-testid disambiguates without changing what's
                  // shown on screen.
                  data-testid={`vendor-subtotal-${group.vendorId}`}
                >
                  {formatCurrency(group.subtotal)}
                </span>
              </p>
            </header>

            <ul className="divide-y divide-brand-indigo/5">
              {group.items.map((item) => (
                <li key={item.productId} className="flex items-center gap-3 p-4">
                  <div className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-surface-cardMuted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] font-medium text-slate-400">
                        No image
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-semibold text-brand-indigo">{item.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{formatCurrency(item.price)} each</p>

                    <div className="mt-2 flex items-center gap-2">
                      <div className="flex items-center rounded-md border border-brand-indigo/15">
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.quantity - 1)}
                          aria-label={`Decrease quantity of ${item.name}`}
                          className="flex h-9 w-9 items-center justify-center text-brand-indigo
                            hover:bg-surface-cardMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-saffron"
                        >
                          <Minus size={14} aria-hidden="true" />
                        </button>
                        <span className="w-8 text-center text-sm font-semibold text-brand-indigo" aria-live="polite">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQuantity(item.productId, item.quantity + 1)}
                          aria-label={`Increase quantity of ${item.name}`}
                          className="flex h-9 w-9 items-center justify-center text-brand-indigo
                            hover:bg-surface-cardMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-saffron"
                        >
                          <Plus size={14} aria-hidden="true" />
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.productId)}
                        aria-label={`Remove ${item.name} from cart`}
                        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400
                          hover:bg-tint-chilli-bg hover:text-tint-chilli-text
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
                      >
                        <Trash2 size={16} aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <p className="shrink-0 font-display text-sm font-bold text-brand-indigo">
                    {formatCurrency(item.price * item.quantity)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Cart-level subtotal only - tax/shipping is authoritative from POST /orders (Session 3),
          not computed here, per the plan. */}
      <div className="rounded-lg border border-brand-indigo/10 bg-white p-4 shadow-premium-card">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500">Subtotal</span>
          <span className="font-display text-lg font-bold text-brand-indigo">{formatCurrency(subtotal)}</span>
        </div>
        <p className="mt-1 text-xs text-slate-400">Tax and shipping calculated at checkout.</p>

        <button
          type="button"
          onClick={() => navigate("/checkout")}
          className="mt-4 min-h-[44px] w-full rounded-md bg-brand-saffron px-4 text-sm font-bold text-white transition
            hover:bg-brand-saffron/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron"
        >
          Proceed to Checkout
        </button>
      </div>
    </div>
  );
}
