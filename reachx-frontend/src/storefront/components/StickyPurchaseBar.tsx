import { formatCurrency } from "../utils/formatCurrency";

interface StickyPurchaseBarProps {
  price: number;
  outOfStock: boolean;
  onAddToCart: () => void;
}

// Mobile-only sticky bottom bar (price + Add to Cart) while scrolling the product detail page,
// per the session plan's explicit UX requirement. Sits above the bottom tab bar (which is
// itself sm:hidden) so the two never overlap - see the bottom offset below matching the tab
// bar's ~52px min-height + safe-area inset.
export function StickyPurchaseBar({ price, outOfStock, onAddToCart }: StickyPurchaseBarProps) {
  return (
    <div
      className="fixed inset-x-0 z-30 flex items-center justify-between gap-4 border-t border-brand-indigo/10
        bg-white/95 px-4 py-3 shadow-premium-dropdown backdrop-blur sm:hidden"
      style={{ bottom: "calc(52px + env(safe-area-inset-bottom))" }}
    >
      <p className="font-display text-lg font-bold text-brand-indigo">{formatCurrency(price)}</p>
      <button
        type="button"
        onClick={onAddToCart}
        disabled={outOfStock}
        className="min-h-[44px] flex-1 max-w-[220px] rounded-md bg-brand-saffron px-4 text-sm font-bold text-white transition
          hover:bg-brand-saffron/90 disabled:cursor-not-allowed disabled:opacity-40
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron"
      >
        {outOfStock ? "Out of stock" : "Add to Cart"}
      </button>
    </div>
  );
}
