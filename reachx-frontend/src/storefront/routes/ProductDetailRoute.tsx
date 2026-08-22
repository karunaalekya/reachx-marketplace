import { useEffect, useState } from "react";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, ShoppingCart } from "lucide-react";
import { getProductById, Product } from "../api/productsApi";
import { formatCurrency } from "../utils/formatCurrency";
import { ProductImageGallery } from "../components/ProductImageGallery";
import { StickyPurchaseBar } from "../components/StickyPurchaseBar";
import { useCartStore } from "../store/useCartStore";
import type { StorefrontOutletContext } from "../layouts/StorefrontShell";

function DetailSkeleton() {
  return (
    <div className="grid gap-6 sm:grid-cols-2" role="status" aria-label="Loading product">
      <div className="aspect-square w-full rounded-lg bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%] motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60" />
      <div className="space-y-3">
        <div className="h-6 w-3/4 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
        <div className="h-4 w-1/3 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
        <div className="h-8 w-1/4 rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
        <div className="h-24 w-full rounded bg-surface-cardMuted motion-safe:animate-skeleton-shimmer motion-reduce:opacity-60 bg-gradient-to-r from-surface-cardMuted via-white to-surface-cardMuted bg-[length:200%_100%]" />
      </div>
    </div>
  );
}

export function ProductDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { pushToast } = useOutletContext<StorefrontOutletContext>();
  const addToCart = useCartStore((s) => s.addItem);

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const productId = Number(id);
    if (!id || Number.isNaN(productId)) {
      setError("That product link doesn't look right.");
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    getProductById(productId)
      .then((p) => {
        if (!cancelled) setProduct(p);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load this product.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (isLoading) {
    return <DetailSkeleton />;
  }

  if (error || !product) {
    return (
      <div className="rounded-lg bg-white p-16 text-center shadow-premium-card">
        <p className="font-display text-lg text-brand-indigo">
          {error ?? "Product not found"}
        </p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-semibold text-white
            hover:bg-brand-indigo/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to browsing
        </button>
      </div>
    );
  }

  // GET /products/{id} doesn't filter by status server-side (unlike the search endpoint, which
  // does) - a DRAFT/OUT_OF_STOCK/ARCHIVED product is still fetchable by a guessed/direct id.
  // Rather than silently rendering a live "buy" flow for something not actually for sale, a
  // non-ACTIVE product (other than the ordinary OUT_OF_STOCK case, handled inline below via
  // stockQuantity) is treated as unavailable here.
  const isListed = product.status === "ACTIVE" || product.status === "OUT_OF_STOCK";
  if (!isListed) {
    return (
      <div className="rounded-lg bg-white p-16 text-center shadow-premium-card">
        <p className="font-display text-lg text-brand-indigo">This product isn't available</p>
        <button
          type="button"
          onClick={() => navigate("/")}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-indigo px-4 py-2 text-sm font-semibold text-white
            hover:bg-brand-indigo/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Back to browsing
        </button>
      </div>
    );
  }

  const outOfStock = product.stockQuantity <= 0;

  // Real add-to-cart as of Session 2, replacing Session 1's pushCartStubToast - shared by both
  // the desktop button below and the mobile StickyPurchaseBar.
  function handleAddToCart() {
    if (!product) return;
    addToCart(product);
    pushToast("neem", "Added to cart", product.name);
  }

  return (
    <div className="pb-24 sm:pb-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-brand-indigo
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron rounded"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back
      </button>

      <div className="grid gap-8 sm:grid-cols-2">
        <ProductImageGallery images={product.imageUrls} productName={product.name} />

        <div className="space-y-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-indigo">{product.name}</h1>
            <p className="mt-1 text-sm font-medium text-slate-400">Seller #{product.vendorId}</p>
          </div>

          <p className="font-display text-3xl font-bold text-brand-indigo">
            {formatCurrency(product.price)}
          </p>

          {outOfStock ? (
            <span className="inline-block rounded border border-tint-chilli-border bg-tint-chilli-bg px-2.5 py-1 text-xs font-bold text-tint-chilli-text">
              Out of stock
            </span>
          ) : (
            <span className="inline-block rounded border border-tint-neem-border bg-tint-neem-bg px-2.5 py-1 text-xs font-bold text-tint-neem-text">
              In stock
            </span>
          )}

          {product.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
              {product.description}
            </p>
          )}

          {/* Buy Now (skip-cart, instant checkout) is still not built - it was deferred in
              Session 1 until cart/checkout existed to complete it, and Session 2 only gets the
              checkout FORM (not yet wired to POST /orders), so a "Buy Now" entry point still
              wouldn't have anywhere real to go. Revisit once Session 3 wires checkout live. */}
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={outOfStock}
            className="hidden min-h-[44px] w-full items-center justify-center gap-2 rounded-md bg-brand-saffron px-4 text-sm font-bold text-white
              transition hover:bg-brand-saffron/90 disabled:cursor-not-allowed disabled:opacity-40
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron sm:flex"
          >
            <ShoppingCart size={18} aria-hidden="true" />
            {outOfStock ? "Out of stock" : "Add to Cart"}
          </button>
        </div>
      </div>

      {/* Mobile-only sticky bottom bar duplicates the desktop Add to Cart button above (which is
          sm:hidden) rather than the page relying on scrolling back up to the button on small
          screens, per the session plan's explicit requirement. */}
      <StickyPurchaseBar price={product.price} outOfStock={outOfStock} onAddToCart={handleAddToCart} />
    </div>
  );
}
