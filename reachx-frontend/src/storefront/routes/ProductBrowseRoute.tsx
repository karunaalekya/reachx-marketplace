import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";
import { useProductBrowseStore } from "../store/useProductBrowseStore";
import { useCartStore } from "../store/useCartStore";
import type { Product } from "../api/productsApi";
import { ProductCard } from "../components/ProductCard";
import { ProductGridSkeleton } from "../components/ProductGridSkeleton";
import type { StorefrontOutletContext } from "../layouts/StorefrontShell";

// C-OQ1 scope call (the plan flags this as needing a decision before routing is set): "/" is the
// product grid itself, not a separate marketing homepage. Reasoning: there's no marketing-copy
// backend or CMS content to populate a distinct homepage with (every real endpoint here is
// catalogue/order data), and App.tsx's own pre-existing comment already earmarked "/" to become
// "the storefront root" - a grid-first landing is the smaller, non-speculative choice. Revisit
// if/when there's an actual marketing content source to justify a separate route.
export function ProductBrowseRoute() {
  const { pushToast } = useOutletContext<StorefrontOutletContext>();
  const { products, filters, setFilters, fetchProducts, isLoading, error, page, totalPages } =
    useProductBrowseStore();
  const addToCart = useCartStore((s) => s.addItem);

  const [minPriceDraft, setMinPriceDraft] = useState(filters.minPrice?.toString() ?? "");
  const [maxPriceDraft, setMaxPriceDraft] = useState(filters.maxPrice?.toString() ?? "");

  useEffect(() => {
    fetchProducts(0);
    // Fetch once on mount with whatever filters already exist in the store (e.g. carried over
    // from a header search submit) - not re-run on every filters change, which applyPriceFilter
    // below triggers explicitly instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPriceFilter() {
    setFilters({
      ...filters,
      minPrice: minPriceDraft ? Number(minPriceDraft) : undefined,
      maxPrice: maxPriceDraft ? Number(maxPriceDraft) : undefined,
    });
    fetchProducts(0);
  }

  // Real add-to-cart as of Session 2, replacing Session 1's pushCartStubToast. Cart writes are
  // instant local state (useCartStore), so this stays synchronous - no loading state needed
  // for the click itself.
  function handleAddToCart(product: Product) {
    addToCart(product);
    pushToast("neem", "Added to cart", product.name);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-indigo">
          <SlidersHorizontal size={16} aria-hidden="true" />
          Filter by price
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="min-price">Minimum price</label>
          <input
            id="min-price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Min ₹"
            value={minPriceDraft}
            onChange={(e) => setMinPriceDraft(e.target.value)}
            className="w-24 rounded-md border border-brand-indigo/15 bg-white px-3 py-2 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          />
          <span className="text-slate-400">–</span>
          <label className="sr-only" htmlFor="max-price">Maximum price</label>
          <input
            id="max-price"
            type="number"
            inputMode="decimal"
            min={0}
            placeholder="Max ₹"
            value={maxPriceDraft}
            onChange={(e) => setMaxPriceDraft(e.target.value)}
            className="w-24 rounded-md border border-brand-indigo/15 bg-white px-3 py-2 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          />
        </div>
        <button
          type="button"
          onClick={applyPriceFilter}
          className="min-h-[40px] rounded-md bg-brand-indigo px-4 text-sm font-semibold text-white transition hover:bg-brand-indigo/90
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo"
        >
          Apply
        </button>
        {/* No category filter here: there is no categories endpoint anywhere in the backend
            (no CategoryController/Category entity) to resolve categoryId to a name or list
            options from - omitted rather than faked, same "flag the gap" discipline as the
            Seller #{vendorId} placeholder. */}
      </div>

      {error && (
        <div className="rounded-md border border-tint-chilli-border bg-tint-chilli-bg px-4 py-3 text-sm text-tint-chilli-text">
          {error}
        </div>
      )}

      {isLoading ? (
        <ProductGridSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-lg bg-white p-16 text-center shadow-premium-card">
          <p className="font-display text-lg text-brand-indigo">No products found</p>
          <p className="mt-1 text-sm opacity-60">Try adjusting your search or price filter.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                onAddToCart={() => handleAddToCart(product)}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => fetchProducts(page - 1)}
                className="min-h-[40px] rounded-md border border-brand-indigo/15 px-4 text-sm font-medium text-brand-indigo
                  disabled:cursor-not-allowed disabled:opacity-40
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
              >
                Previous
              </button>
              <span className="text-sm text-slate-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => fetchProducts(page + 1)}
                className="min-h-[40px] rounded-md border border-brand-indigo/15 px-4 text-sm font-medium text-brand-indigo
                  disabled:cursor-not-allowed disabled:opacity-40
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
