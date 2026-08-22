// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source
// (ProductController, ProductResponse, ProductRepository.search) - not inferred from the session
// plan prose alone, same discipline as the vendor track's *Api.ts files.
//
// Two things confirmed by reading the actual source rather than assuming from the plan:
// 1. GET /products already filters to `status = 'ACTIVE'` server-side (ProductRepository.search's
//    JPQL) - the frontend does not need to (and should not) re-filter by status itself.
// 2. GET /products/{id} (ProductService.getById) does NOT filter by status - a guest who has a
//    direct link/guessed id to a DRAFT/ARCHIVED product can still fetch it. That's a backend
//    trust-boundary question out of scope for this frontend track, but the detail route below
//    treats a non-ACTIVE product as unavailable rather than silently rendering a "buy" flow for
//    a product not actually for sale - see ProductDetailRoute.tsx.
//
// No categories endpoint exists anywhere in the backend (no CategoryController, no Category
// entity) - `categoryId` is a bare Long column with nothing to resolve it to a name. The browse
// filter UI below only exposes text search + price range for that reason; a category filter
// isn't silently dropped, there's nothing real to back it yet.

export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number; // 0-indexed current page
  size: number;
  first: boolean;
  last: boolean;
  empty: boolean;
}

export type ProductStatus = "DRAFT" | "ACTIVE" | "OUT_OF_STOCK" | "ARCHIVED";

export interface Product {
  id: number;
  vendorId: number;
  categoryId: number | null;
  name: string;
  description: string | null;
  price: number;
  stockQuantity: number;
  sku: string;
  status: ProductStatus;
  createdAt: string;
  imageUrls: string[];
}

export interface ProductSearchParams {
  categoryId?: number;
  minPrice?: number;
  maxPrice?: number;
  q?: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

// Backend error shape confirmed from GlobalExceptionHandler: { timestamp, status, error, fields? }
// - the message key is `error`, not `message`. Rendered as plain language, never a raw status code.
async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const message = body?.error ?? `Something went wrong (${res.status}). Please try again.`;
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

// GET /products?categoryId=&minPrice=&maxPrice=&q= - public, paginated.
export async function searchProducts(
  filters: ProductSearchParams,
  page = 0,
  size = 24
): Promise<Page<Product>> {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (filters.categoryId != null) params.set("categoryId", String(filters.categoryId));
  if (filters.minPrice != null) params.set("minPrice", String(filters.minPrice));
  if (filters.maxPrice != null) params.set("maxPrice", String(filters.maxPrice));
  if (filters.q) params.set("q", filters.q);

  const res = await fetch(`${API_BASE}/products?${params.toString()}`);
  return unwrap<Page<Product>>(res);
}

// GET /products/{id} - public, single product, imageUrls included directly (per the session
// plan: use this for the gallery, not the separate /products/{id}/images sub-resource, whose
// shape is unconfirmed and unneeded here).
export async function getProductById(id: number): Promise<Product> {
  const res = await fetch(`${API_BASE}/products/${id}`);
  return unwrap<Product>(res);
}
