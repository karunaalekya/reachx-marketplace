import { create } from "zustand";
import {
  Product,
  ProductRequest,
  ProductImage,
  listMyProducts,
  createProduct,
  updateProduct,
  publishProduct,
  archiveProduct,
  listProductImages,
  presignAndUploadProductImage,
  confirmProductImageUpload,
  deleteProductImage,
} from "../api/productsApi";

// No persist middleware - same reasoning as useOrdersStore/usePayoutStore: product name, price,
// stock, and image URLs are live business data, refetched on mount/focus rather than cached
// across a reload. No PII involved here, so this is a simpler "don't cache business data" call
// rather than the KYC store's stricter partialize-driven privacy exclusion.

// A product image that reached the bucket but whose confirm call to the backend never landed -
// same shape/reasoning as useVendorStore.ts's PendingConfirm. Scoped to one in-flight image at a
// time app-wide, same call this project already made for useToasts (a real stacking system for
// concurrent per-product uploads is undecided new scope, not invented here as a side effect).
interface PendingImageConfirm {
  productId: number;
  objectKey: string;
}

interface ProductsState {
  vendorId: number | null;
  products: Product[];
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;

  // Fetched on demand per product (see productsApi.ts's note on why imageUrls alone isn't
  // enough to support deleting a specific image) - keyed by productId, empty until a vendor
  // opens that product's image manager.
  productImages: Record<number, ProductImage[]>;
  imagesLoading: number | null;
  pendingImageConfirm: PendingImageConfirm | null;
  imageError: string | null;

  setVendorContext: (vendorId: number) => void;
  fetchProducts: (token: string, page?: number) => Promise<void>;
  createProduct: (token: string, request: ProductRequest) => Promise<Product | null>;
  updateProduct: (token: string, id: number, request: ProductRequest) => Promise<Product | null>;
  publishProduct: (token: string, id: number) => Promise<boolean>;
  archiveProduct: (token: string, id: number) => Promise<boolean>;

  fetchProductImages: (productId: number) => Promise<void>;
  uploadProductImage: (token: string, productId: number, file: File) => Promise<void>;
  retryImageConfirm: (token: string) => Promise<void>;
  removeProductImage: (token: string, productId: number, imageId: number) => Promise<void>;
}

export const useProductsStore = create<ProductsState>()((set, get) => ({
  vendorId: null,
  products: [],
  page: 0,
  totalPages: 0,
  isLoading: false,
  error: null,

  productImages: {},
  imagesLoading: null,
  pendingImageConfirm: null,
  imageError: null,

  setVendorContext: (vendorId) => set({ vendorId }),

  fetchProducts: async (token, page) => {
    const targetPage = page ?? get().page;
    set({ isLoading: true, error: null });
    try {
      const result = await listMyProducts(token, targetPage);
      set({
        products: result.content,
        page: result.number,
        totalPages: result.totalPages,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load products.",
      });
    }
  },

  // Prepends the new product to the current page rather than refetching - the create response
  // already carries the full ProductResponse (imageUrls: [], status: DRAFT), so there's nothing
  // a refetch would add here that this doesn't already have.
  createProduct: async (token, request) => {
    set({ error: null });
    try {
      const created = await createProduct(token, request);
      set({ products: [created, ...get().products] });
      return created;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to create product." });
      return null;
    }
  },

  updateProduct: async (token, id, request) => {
    set({ error: null });
    try {
      const updated = await updateProduct(token, id, request);
      set({ products: get().products.map((p) => (p.id === id ? updated : p)) });
      return updated;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to update product." });
      return null;
    }
  },

  // publish()/archive() return 204 with no body - patch the known-correct new status locally
  // instead of refetching the whole page for a one-field change.
  publishProduct: async (token, id) => {
    set({ error: null });
    try {
      await publishProduct(token, id);
      set({
        products: get().products.map((p) => (p.id === id ? { ...p, status: "ACTIVE" as const } : p)),
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to publish product." });
      return false;
    }
  },

  archiveProduct: async (token, id) => {
    set({ error: null });
    try {
      await archiveProduct(token, id);
      set({
        products: get().products.map((p) => (p.id === id ? { ...p, status: "ARCHIVED" as const } : p)),
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : "Failed to archive product." });
      return false;
    }
  },

  fetchProductImages: async (productId) => {
    set({ imagesLoading: productId, imageError: null });
    try {
      const images = await listProductImages(productId);
      set({ productImages: { ...get().productImages, [productId]: images }, imagesLoading: null });
    } catch (err) {
      set({
        imagesLoading: null,
        imageError: err instanceof Error ? err.message : "Failed to load images.",
      });
    }
  },

  uploadProductImage: async (token, productId, file) => {
    set({ imageError: null, pendingImageConfirm: null });

    let objectKey: string;
    try {
      const result = await presignAndUploadProductImage(token, productId, file);
      objectKey = result.objectKey;
    } catch (err) {
      set({ imageError: err instanceof Error ? err.message : "Upload failed." });
      return;
    }

    try {
      const image = await confirmProductImageUpload(token, productId, objectKey);
      const existing = get().productImages[productId] ?? [];
      set({
        productImages: { ...get().productImages, [productId]: [...existing, image] },
        products: get().products.map((p) =>
          p.id === productId ? { ...p, imageUrls: [...p.imageUrls, image.imageUrl] } : p
        ),
      });
    } catch (err) {
      set({
        pendingImageConfirm: { productId, objectKey },
        imageError:
          "Your image reached storage, but we couldn't confirm it with the server. " +
          "Retry confirming below - no need to re-upload.",
      });
    }
  },

  retryImageConfirm: async (token) => {
    const { pendingImageConfirm } = get();
    if (!pendingImageConfirm) return;
    const { productId, objectKey } = pendingImageConfirm;
    set({ imageError: null });
    try {
      const image = await confirmProductImageUpload(token, productId, objectKey);
      const existing = get().productImages[productId] ?? [];
      set({
        productImages: { ...get().productImages, [productId]: [...existing, image] },
        products: get().products.map((p) =>
          p.id === productId ? { ...p, imageUrls: [...p.imageUrls, image.imageUrl] } : p
        ),
        pendingImageConfirm: null,
      });
    } catch (err) {
      // Keep pendingImageConfirm intact - same reasoning as useVendorStore.ts's retryConfirm,
      // a second dropped connection shouldn't lose track of an objectKey still safe in the bucket.
      set({
        imageError:
          err instanceof Error ? `Still couldn't confirm: ${err.message}` : "Still couldn't confirm. You can try again.",
      });
    }
  },

  removeProductImage: async (token, productId, imageId) => {
    set({ imageError: null });
    try {
      await deleteProductImage(token, productId, imageId);
      const remaining = (get().productImages[productId] ?? []).filter((img) => img.id !== imageId);
      const removedUrl = (get().productImages[productId] ?? []).find((img) => img.id === imageId)?.imageUrl;
      set({
        productImages: { ...get().productImages, [productId]: remaining },
        products: get().products.map((p) =>
          p.id === productId
            ? { ...p, imageUrls: p.imageUrls.filter((url) => url !== removedUrl) }
            : p
        ),
      });
    } catch (err) {
      set({ imageError: err instanceof Error ? err.message : "Failed to delete image." });
    }
  },
}));
