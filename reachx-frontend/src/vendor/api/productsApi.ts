// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source this
// session (ProductController, ProductImageController, ProductService, ProductImageService,
// ProductRequest/ProductResponse, PresignedUploadRequest/Response, ConfirmImageUploadRequest,
// ProductImageResponse, Product.ProductStatus - controllers/DTOs/entities read directly, not
// inferred from MASTER_BLUEPRINT.md prose alone). Same discipline as ordersApi.ts/payoutApi.ts.
//
// One real correction vs. the session-plan table in PRESENT_POSITION_AND_DESIGN_DECISIONS.md:
// there is no CategoryController/Category entity anywhere in the backend - `categoryId` on
// Product is a bare, unvalidated Long with no lookup table behind it. A category picker/dropdown
// would be inventing an endpoint this project's own discipline explicitly rejects (same call
// already made for Orders/Disputes when their contracts were thinner than hoped) - the form below
// takes categoryId as a plain optional number field, not a select.

import type { Page } from "./payoutApi";

// Product.ProductStatus - the real enum, verbatim. New products always start DRAFT
// (ProductService.create hardcodes this) - there is no "create as ACTIVE" path.
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
  // Plain URLs only - ProductResponse carries no per-image id here. Deleting a specific image
  // needs its id, which only the dedicated GET /products/{id}/images call returns (see
  // ProductImage below) - fetched on demand when a vendor opens a product's image manager,
  // not folded into every list/mine response.
  imageUrls: string[];
}

// ProductRequest - the real record, verbatim field-for-field (name/description/categoryId/
// price/stockQuantity/sku). Used for both create (POST) and update (PUT) - the backend accepts
// the same shape for both.
export interface ProductRequest {
  name: string;
  description: string | null;
  categoryId: number | null;
  price: number;
  stockQuantity: number;
  sku: string;
}

export interface ProductImage {
  id: number;
  productId: number;
  imageUrl: string;
  displayOrder: number;
  createdAt: string;
}

interface PresignImageResponse {
  uploadUrl: string;
  publicUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// PUT/POST/publish/archive that return 204 No Content - unwrap() above would fail trying to
// .json() an empty body, so these get their own void-returning check.
async function unwrapVoid(res: Response): Promise<void> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
}

// GET /products/mine - vendor's own products, every status included (DRAFT/ACTIVE/
// OUT_OF_STOCK/ARCHIVED all come back together; there is no server-side status filter on this
// endpoint, unlike GET /orders/mine - the panel filters client-side if needed).
export async function listMyProducts(token: string, page = 0, size = 20): Promise<Page<Product>> {
  const res = await fetch(`${API_BASE}/products/mine?page=${page}&size=${size}`, {
    headers: authHeaders(token),
  });
  return unwrap<Page<Product>>(res);
}

// POST /products - always created as DRAFT server-side, regardless of what's sent.
export async function createProduct(token: string, request: ProductRequest): Promise<Product> {
  const res = await fetch(`${API_BASE}/products`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return unwrap<Product>(res);
}

// PUT /products/{id} - ownership enforced server-side (assertOwnership throws 404, not 403, on
// a mismatch - ResourceNotFoundException, same pattern as OrdersController's vendor scoping).
// Real side effect worth surfacing, not silently absorbed: setting stockQuantity to 0 flips an
// ACTIVE product to OUT_OF_STOCK server-side; raising it back above 0 flips OUT_OF_STOCK back to
// ACTIVE. Nothing to do client-side for this - just don't show a stale status after a save.
export async function updateProduct(
  token: string,
  id: number,
  request: ProductRequest
): Promise<Product> {
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: "PUT",
    headers: authHeaders(token),
    body: JSON.stringify(request),
  });
  return unwrap<Product>(res);
}

// POST /products/{id}/publish - 204 on success. Real backend rule (ProductService.publish):
// throws if stockQuantity <= 0 ("Cannot publish a product with zero stock"), surfaced as a
// generic 500 by the default exception handling (IllegalStateException has no dedicated
// @ExceptionHandler in this codebase) - the panel disables the button client-side for the common
// case (stock already known to be 0) but still surfaces whatever message actually comes back
// rather than assuming the disable covers every case.
export async function publishProduct(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${id}/publish`, {
    method: "POST",
    headers: authHeaders(token),
  });
  return unwrapVoid(res);
}

// DELETE /products/{id} - soft delete (sets status ARCHIVED), not a real row delete - matches
// ProductService.archive exactly. 204 on success.
export async function archiveProduct(token: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return unwrapVoid(res);
}

// GET /products/{productId}/images - public, no auth required (storefront needs this too), but
// sending the vendor's token along is harmless and keeps every call in this file consistent.
export async function listProductImages(productId: number): Promise<ProductImage[]> {
  const res = await fetch(`${API_BASE}/products/${productId}/images`);
  return unwrap<ProductImage[]>(res);
}

// Same two-step presign/confirm split as kycApi.ts, and for the same reason: a failed PUT means
// nothing reached the bucket (plain failure, nothing to retry); a failed confirm means the file
// is already sitting safely in the bucket and only ProductImageController's record of it is
// missing - a real, recoverable gap distinct from a plain upload failure.
//
// Content-type is whitelisted server-side (PresignedUploadRequest's @Pattern) to
// image/jpeg|jpg|png|webp - a rejected file type comes back as a 400 from the presign call
// itself, not a client-side guess.
export async function presignAndUploadProductImage(
  token: string,
  productId: number,
  file: File
): Promise<{ objectKey: string }> {
  const presignRes = await fetch(`${API_BASE}/products/${productId}/images/presign`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ fileName: file.name, contentType: file.type }),
  });
  const presign = await unwrap<PresignImageResponse>(presignRes);

  const putRes = await fetch(presign.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!putRes.ok) {
    throw new Error("Upload to storage failed - the file never reached the bucket, nothing was confirmed.");
  }

  return { objectKey: presign.objectKey };
}

// Step 2: safe to retry with the same objectKey - idempotent from the caller's side, same as
// kycApi.ts's confirmBucketUpload.
export async function confirmProductImageUpload(
  token: string,
  productId: number,
  objectKey: string,
  displayOrder?: number
): Promise<ProductImage> {
  const res = await fetch(`${API_BASE}/products/${productId}/images`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ objectKey, displayOrder }),
  });
  return unwrap<ProductImage>(res);
}

// DELETE /products/{productId}/images/{imageId} - 204 on success.
export async function deleteProductImage(
  token: string,
  productId: number,
  imageId: number
): Promise<void> {
  const res = await fetch(`${API_BASE}/products/${productId}/images/${imageId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
  return unwrapVoid(res);
}
