import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Product } from "../api/productsApi";

// Storefront's own store, not folded into the vendor track's stores - same "Zustand per domain,
// not one global store" convention useProductBrowseStore.ts already follows. Unlike that store,
// the cart genuinely needs `persist`: a guest's cart surviving a reload/tab close is a baseline
// e-commerce expectation, and cart contents (product id/qty/price/name/vendorId) aren't
// sensitive the way the vendor track's JWT is - so, unlike useVendorStore.ts's KYC slice, no
// partialize exclusions are needed here.

export interface CartLineItem {
  productId: number;
  name: string;
  price: number;
  quantity: number;
  vendorId: number;
  imageUrl: string | null;
}

export interface VendorCartGroup {
  vendorId: number;
  items: CartLineItem[];
  subtotal: number;
}

interface CartState {
  items: CartLineItem[];
  addItem: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  removeItem: (productId: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],

      addItem: (product, quantity = 1) => {
        const existing = get().items.find((i) => i.productId === product.id);
        if (existing) {
          set({
            items: get().items.map((i) =>
              i.productId === product.id ? { ...i, quantity: i.quantity + quantity } : i
            ),
          });
          return;
        }
        set({
          items: [
            ...get().items,
            {
              productId: product.id,
              name: product.name,
              price: product.price,
              quantity,
              vendorId: product.vendorId,
              // Same imageUrls[0] field ProductCard.tsx already reads for the grid thumbnail -
              // reused here rather than a second product fetch just to show a cart thumbnail.
              imageUrl: product.imageUrls[0] ?? null,
            },
          ],
        });
      },

      setQuantity: (productId, quantity) => {
        // Dropping to 0 (or below, defensively) removes the line - same behaviour a customer
        // expects from the stepper's "-" button on the last unit, not a lingering qty-0 row.
        if (quantity <= 0) {
          get().removeItem(productId);
          return;
        }
        set({
          items: get().items.map((i) => (i.productId === productId ? { ...i, quantity } : i)),
        });
      },

      removeItem: (productId) => {
        set({ items: get().items.filter((i) => i.productId !== productId) });
      },

      clear: () => set({ items: [] }),
    }),
    {
      // localStorage key - namespaced so it can never collide with the vendor track's own
      // persisted keys (useVendorStore.ts, useAuthStore.ts) if this ever runs in the same
      // browser profile as the vendor dashboard.
      name: "reachx-storefront-cart",
    }
  )
);

// Plain selector functions, not extra store fields recomputed on every set() - derived,
// read-only views over `items` that always stay in sync with it since there's no separate
// place to update. Use as `useCartStore((s) => selectItemCount(s.items))` for a memo-friendly
// subscription, or `selectX(useCartStore.getState().items)` for a one-off read outside React.

export function selectItemCount(items: CartLineItem[]): number {
  return items.reduce((sum, i) => sum + i.quantity, 0);
}

export function selectSubtotal(items: CartLineItem[]): number {
  return items.reduce((sum, i) => sum + i.price * i.quantity, 0);
}

// The plan's "most important storefront design decision" - group cart items by vendorId so the
// customer understands pre-checkout that one order may ship as several independent vendor
// consignments. Computed once here so CartRoute.tsx and CheckoutFormRoute.tsx's order summary
// both consume the same grouping instead of each re-deriving it slightly differently.
export function selectGroupedByVendor(items: CartLineItem[]): VendorCartGroup[] {
  const groups = new Map<number, CartLineItem[]>();
  for (const item of items) {
    const existing = groups.get(item.vendorId);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(item.vendorId, [item]);
    }
  }
  return Array.from(groups.entries()).map(([vendorId, groupItems]) => ({
    vendorId,
    items: groupItems,
    subtotal: selectSubtotal(groupItems),
  }));
}
