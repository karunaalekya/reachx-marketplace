import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  UploadCloud,
  Trash2,
  Loader2,
  ImageOff,
} from "lucide-react";
import { useProductsStore } from "../store/useProductsStore";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import { useToasts } from "../../shared/hooks/useToasts";
import { OperationToast } from "../../shared/components/OperationToast";
import type { Product, ProductRequest, ProductStatus } from "../api/productsApi";

// Checked directly against ProductController/ProductImageController/ProductService - GET
// /products/mine, POST /products, PUT /products/{id}, POST /products/{id}/publish, DELETE
// /products/{id}, plus the image presign/confirm/delete trio. No CategoryController exists in
// this backend (see productsApi.ts) - categoryId is a plain optional number input, not a picker.

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const MONEY = "font-mono tabular-nums";

const STATUS_LABEL: Record<ProductStatus, string> = {
  DRAFT: "Draft",
  ACTIVE: "Live",
  OUT_OF_STOCK: "Out of stock",
  ARCHIVED: "Archived",
};

const STATUS_VARIANT: Record<ProductStatus, "neem" | "chilli" | "saffron" | "muted"> = {
  DRAFT: "muted",
  ACTIVE: "neem",
  OUT_OF_STOCK: "saffron",
  ARCHIVED: "muted",
};

function StatusChip({ status }: { status: ProductStatus }) {
  const variant = STATUS_VARIANT[status];
  return (
    <span
      className={`rounded-md border-l-4 px-2.5 py-1 text-xs font-medium bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

// Design brief 3i: "inline stock urgency (tinted number, not a separate badge) - quieter than a
// warning banner, on purpose." A separate StatusChip already carries OUT_OF_STOCK; this only
// tints the number itself for the ACTIVE-but-getting-low case a status chip can't express.
function stockClass(stockQuantity: number): string {
  if (stockQuantity <= 0) return "text-tint-chilli-text";
  if (stockQuantity <= 5) return "text-tint-saffron-text";
  return "text-brand-indigo";
}

const emptyForm: ProductRequest = {
  name: "",
  description: "",
  categoryId: null,
  price: 0,
  stockQuantity: 0,
  sku: "",
};

interface ProductsPanelProps {
  vendorId: number;
  authToken: string;
}

export function ProductsPanel({ vendorId, authToken }: ProductsPanelProps) {
  const {
    products,
    page,
    totalPages,
    isLoading,
    error,
    setVendorContext,
    fetchProducts,
    createProduct,
    updateProduct,
    publishProduct,
    archiveProduct,
  } = useProductsStore();

  const { toasts, pushToast, dismissToast } = useToasts();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState<ProductRequest>(emptyForm);
  const [creating, setCreating] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    setVendorContext(vendorId);
    fetchProducts(authToken, 0);
    // Runs once per vendor identity - same pattern as OrdersPanel/VendorPayoutLedger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useRefetchOnFocus(() => fetchProducts(authToken));

  async function handleCreate() {
    if (!createForm.name.trim() || !createForm.sku.trim()) {
      pushToast("chilli", "Name and SKU are required.");
      return;
    }
    setCreating(true);
    const created = await createProduct(authToken, createForm);
    setCreating(false);
    if (created) {
      pushToast("neem", "Product created as a draft.", "Add photos and publish when ready.");
      setCreateForm(emptyForm);
      setShowCreateForm(false);
      setExpandedId(created.id);
    } else {
      pushToast("chilli", "Couldn't create the product.", useProductsStore.getState().error ?? undefined);
    }
  }

  async function handlePublish(product: Product) {
    const ok = await publishProduct(authToken, product.id);
    if (ok) {
      pushToast("neem", `${product.name} is now live.`);
    } else {
      pushToast(
        "chilli",
        "Couldn't publish this product.",
        useProductsStore.getState().error ?? "Products need stock above zero to go live."
      );
    }
  }

  async function handleArchive(product: Product) {
    const ok = await archiveProduct(authToken, product.id);
    if (ok) {
      pushToast("saffron", `${product.name} archived.`, "It's no longer visible on the storefront.");
    } else {
      pushToast("chilli", "Couldn't archive this product.", useProductsStore.getState().error ?? undefined);
    }
  }

  return (
    <div className="space-y-6">
      <StaggerReveal index={1}>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">
            {products.length === 0 && !isLoading ? "No products yet." : `${products.length} product${products.length === 1 ? "" : "s"} on this page`}
          </p>
          <button
            type="button"
            onClick={() => setShowCreateForm((v) => !v)}
            className="inline-flex items-center gap-2 rounded-md bg-brand-indigo px-3.5 py-2 text-sm font-medium text-white
              hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
          >
            <Plus size={16} aria-hidden="true" />
            New product
          </button>
        </div>
      </StaggerReveal>

      {showCreateForm && (
        <StaggerReveal index={2}>
          <ProductForm
            form={createForm}
            onChange={setCreateForm}
            onSubmit={handleCreate}
            onCancel={() => {
              setShowCreateForm(false);
              setCreateForm(emptyForm);
            }}
            submitting={creating}
            submitLabel="Create draft"
          />
        </StaggerReveal>
      )}

      {error && (
        <div className="rounded-md border-l-4 bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <StaggerReveal index={3}>
        <div className="rounded-lg bg-white shadow-premium-card overflow-hidden">
          {isLoading && products.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading products…</div>
          ) : products.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">
              Nothing here yet - create your first product above.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {products.map((product) => {
                const isExpanded = expandedId === product.id;
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(isExpanded ? null : product.id)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left
                        hover:bg-surface-cardMuted transition
                        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-indigo"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {product.imageUrls[0] ? (
                          <img
                            src={product.imageUrls[0]}
                            alt=""
                            className="h-10 w-10 shrink-0 rounded object-cover"
                          />
                        ) : (
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-cardMuted text-slate-300">
                            <ImageOff size={16} aria-hidden="true" />
                          </span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-brand-indigo">{product.name}</p>
                          <p className={`text-xs text-slate-400 ${MONEY}`}>SKU {product.sku}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className={`text-xs ${MONEY} ${stockClass(product.stockQuantity)}`}>
                          {product.stockQuantity} in stock
                        </span>
                        <p className={`text-sm font-bold text-brand-indigo ${MONEY}`}>{INR.format(product.price)}</p>
                        <StatusChip status={product.status} />
                        <ChevronDown
                          size={18}
                          className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 motion-safe:animate-shell-reveal">
                        <ProductDetail
                          product={product}
                          authToken={authToken}
                          onSave={async (request) => {
                            const updated = await updateProduct(authToken, product.id, request);
                            if (updated) {
                              pushToast("neem", "Product updated.");
                            } else {
                              pushToast("chilli", "Couldn't save changes.", useProductsStore.getState().error ?? undefined);
                            }
                          }}
                          onPublish={() => handlePublish(product)}
                          onArchive={() => handleArchive(product)}
                          pushToast={pushToast}
                        />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => fetchProducts(authToken, page - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              className="rounded-md p-1.5 text-slate-400 hover:bg-surface-cardMuted disabled:opacity-30
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span className={`text-xs text-slate-400 ${MONEY}`}>
              Page {page + 1} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => fetchProducts(authToken, page + 1)}
              disabled={page >= totalPages - 1}
              aria-label="Next page"
              className="rounded-md p-1.5 text-slate-400 hover:bg-surface-cardMuted disabled:opacity-30
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo"
            >
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </StaggerReveal>

      {toasts.map((t) => (
        <OperationToast key={t.id} {...t} onClose={dismissToast} />
      ))}
    </div>
  );
}

interface ProductFormProps {
  form: ProductRequest;
  onChange: (form: ProductRequest) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitting: boolean;
  submitLabel: string;
}

function ProductForm({ form, onChange, onSubmit, onCancel, submitting, submitLabel }: ProductFormProps) {
  return (
    <div className="rounded-lg bg-white p-5 shadow-premium-card space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name" span={2}>
          <input
            type="text"
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            className={inputClass}
            maxLength={255}
          />
        </Field>
        <Field label="SKU">
          <input
            type="text"
            value={form.sku}
            onChange={(e) => onChange({ ...form, sku: e.target.value })}
            className={inputClass}
            maxLength={100}
          />
        </Field>
        <Field label="Category ID (optional)">
          <input
            type="number"
            value={form.categoryId ?? ""}
            onChange={(e) => onChange({ ...form, categoryId: e.target.value === "" ? null : Number(e.target.value) })}
            className={inputClass}
          />
        </Field>
        <Field label="Price (₹)">
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.price}
            onChange={(e) => onChange({ ...form, price: Number(e.target.value) })}
            className={inputClass}
          />
        </Field>
        <Field label="Stock quantity">
          <input
            type="number"
            min={0}
            step="1"
            value={form.stockQuantity}
            onChange={(e) => onChange({ ...form, stockQuantity: Number(e.target.value) })}
            className={inputClass}
          />
        </Field>
        <Field label="Description" span={2}>
          <textarea
            value={form.description ?? ""}
            onChange={(e) => onChange({ ...form, description: e.target.value })}
            className={inputClass}
            rows={3}
            maxLength={5000}
          />
        </Field>
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-brand-indigo px-3.5 py-2 text-sm font-medium text-white
            hover:brightness-110 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
        >
          {submitting && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3.5 py-2 text-sm font-medium text-brand-indigo/60 hover:bg-surface-cardMuted
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo transition"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

const inputClass =
  "w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-brand-indigo " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo";

function Field({ label, span = 1, children }: { label: string; span?: 1 | 2; children: React.ReactNode }) {
  return (
    <label className={`block text-xs font-medium text-slate-500 ${span === 2 ? "col-span-2" : ""}`}>
      {label}
      <span className="mt-1 block">{children}</span>
    </label>
  );
}

interface ProductDetailProps {
  product: Product;
  authToken: string;
  onSave: (request: ProductRequest) => Promise<void>;
  onPublish: () => void;
  onArchive: () => void;
  pushToast: (variant: "neem" | "chilli" | "saffron", message: string, subText?: string) => void;
}

function ProductDetail({ product, authToken, onSave, onPublish, onArchive, pushToast }: ProductDetailProps) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<ProductRequest>({
    name: product.name,
    description: product.description,
    categoryId: product.categoryId,
    price: product.price,
    stockQuantity: product.stockQuantity,
    sku: product.sku,
  });
  const [saving, setSaving] = useState(false);

  const {
    productImages,
    imagesLoading,
    pendingImageConfirm,
    imageError,
    fetchProductImages,
    uploadProductImage,
    retryImageConfirm,
    removeProductImage,
  } = useProductsStore();

  useEffect(() => {
    fetchProductImages(product.id);
    // Runs once per product expand - same "run once per identity" pattern as OrdersPanel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  const images = productImages[product.id] ?? [];
  const canPublish = product.status !== "ACTIVE" && product.status !== "ARCHIVED" && product.stockQuantity > 0;

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await uploadProductImage(authToken, product.id, file);
    if (!useProductsStore.getState().imageError) {
      pushToast("neem", "Image uploaded.");
    }
  }

  return (
    <div className="rounded-md bg-surface-cardMuted p-4 shadow-premium-dropdown space-y-4">
      {editing ? (
        <ProductForm
          form={form}
          onChange={setForm}
          submitting={saving}
          submitLabel="Save changes"
          onSubmit={async () => {
            setSaving(true);
            await onSave(form);
            setSaving(false);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {product.description && <p className="text-sm text-slate-600">{product.description}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-brand-indigo shadow-premium-card
                hover:bg-surface-cardMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo transition"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onPublish}
              disabled={!canPublish}
              title={
                product.stockQuantity <= 0
                  ? "Add stock before publishing - a product needs stock above zero to go live."
                  : undefined
              }
              className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-tint-neem-text shadow-premium-card
                hover:bg-surface-cardMuted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo transition"
            >
              Publish
            </button>
            {product.status !== "ARCHIVED" && (
              <button
                type="button"
                onClick={onArchive}
                className="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-tint-chilli-text shadow-premium-card
                  hover:bg-surface-cardMuted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo transition"
              >
                Archive
              </button>
            )}
          </div>
        </>
      )}

      <div className="border-t border-slate-200 pt-3 space-y-2">
        <p className="text-xs font-medium text-slate-500">Photos</p>

        {imageError && (
          <div className="rounded-md border-l-4 bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text px-3 py-2 text-xs">
            {imageError}
            {pendingImageConfirm && pendingImageConfirm.productId === product.id && (
              <button
                type="button"
                onClick={() => retryImageConfirm(authToken)}
                className="ml-2 underline font-medium"
              >
                Retry confirmation
              </button>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {imagesLoading === product.id && images.length === 0 ? (
            <p className="text-xs text-slate-400">Loading photos…</p>
          ) : (
            images.map((img) => (
              <div key={img.id} className="group relative h-16 w-16">
                <img src={img.imageUrl} alt="" className="h-16 w-16 rounded object-cover" />
                <button
                  type="button"
                  onClick={() => removeProductImage(authToken, product.id, img.id)}
                  aria-label="Delete photo"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-white p-1 text-tint-chilli-text shadow-premium-card
                    opacity-0 group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo transition"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </div>
            ))
          )}
          <label
            className="flex h-16 w-16 cursor-pointer items-center justify-center rounded border border-dashed border-slate-300 text-slate-400
              hover:border-brand-indigo hover:text-brand-indigo transition"
          >
            <UploadCloud size={18} aria-hidden="true" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
          </label>
        </div>
      </div>
    </div>
  );
}
