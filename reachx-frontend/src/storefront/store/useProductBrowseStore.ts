import { create } from "zustand";
import { Product, ProductSearchParams, searchProducts } from "../api/productsApi";

// Storefront domain gets its own store, not folded into the vendor track's stores - same
// "Zustand per domain, not one global store" convention the vendor track already follows.
// No persist middleware: browse results are live catalogue data, not something that should
// survive a reload stale (unlike the cart, which is genuinely local-only - see useCartStore.ts
// in Session 2).

interface ProductBrowseState {
  filters: ProductSearchParams;
  products: Product[];
  page: number;
  totalPages: number;
  totalElements: number;
  isLoading: boolean;
  error: string | null;

  setFilters: (filters: ProductSearchParams) => void;
  fetchProducts: (page?: number) => Promise<void>;
}

export const useProductBrowseStore = create<ProductBrowseState>()((set, get) => ({
  filters: {},
  products: [],
  page: 0,
  totalPages: 0,
  totalElements: 0,
  isLoading: false,
  error: null,

  setFilters: (filters) => set({ filters }),

  fetchProducts: async (page) => {
    const targetPage = page ?? 0;
    set({ isLoading: true, error: null });
    try {
      const result = await searchProducts(get().filters, targetPage);
      set({
        products: result.content,
        page: result.number,
        totalPages: result.totalPages,
        totalElements: result.totalElements,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Couldn't load products. Please try again.",
      });
    }
  },
}));
