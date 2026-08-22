import { Link } from "react-router-dom";
import { ShoppingCart } from "lucide-react";
import type { Product } from "../api/productsApi";
import { formatCurrency } from "../utils/formatCurrency";

interface ProductCardProps {
  product: Product;
  // Real handler as of Session 2 - renamed from onAddToCartStub now that the caller
  // (ProductBrowseRoute.tsx) wires this into useCartStore instead of a stub toast.
  onAddToCart: () => void;
}

export function ProductCard({ product, onAddToCart }: ProductCardProps) {
  const image = product.imageUrls[0];
  const outOfStock = product.stockQuantity <= 0;

  return (
    <div className="group flex flex-col overflow-hidden rounded-lg border border-brand-indigo/10 bg-white transition hover:-translate-y-0.5 hover:shadow-premium-hover">
      <Link to={`/product/${product.id}`} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-indigo">
        <div className="relative aspect-square w-full overflow-hidden bg-surface-cardMuted">
          {image ? (
            <img
              src={image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition group-hover:scale-[1.03]"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-400">
              No image
            </div>
          )}
          {outOfStock && (
            <span className="absolute left-2 top-2 rounded border border-tint-chilli-border bg-tint-chilli-bg px-2 py-0.5 text-[11px] font-bold text-tint-chilli-text">
              Out of stock
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <Link
          to={`/product/${product.id}`}
          className="line-clamp-2 text-sm font-semibold leading-snug text-brand-indigo hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo rounded"
        >
          {product.name}
        </Link>
        {/* No confirmed public endpoint resolves vendorId -> businessName for guests
            (GET /vendors/{id} is ADMIN/VENDOR-only) - placeholder per the session plan, not an
            invented display name. */}
        <p className="text-xs font-medium text-slate-400">Seller #{product.vendorId}</p>
        <div className="mt-auto flex items-center justify-between pt-2">
          <p className="font-display text-base font-bold text-brand-indigo">
            {formatCurrency(product.price)}
          </p>
          <button
            type="button"
            onClick={onAddToCart}
            disabled={outOfStock}
            aria-label={`Add ${product.name} to cart`}
            className="flex h-9 w-9 items-center justify-center rounded-md border border-brand-indigo/15 text-brand-indigo
              transition hover:border-brand-saffron hover:text-brand-saffron
              disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-brand-indigo/15 disabled:hover:text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          >
            <ShoppingCart size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
