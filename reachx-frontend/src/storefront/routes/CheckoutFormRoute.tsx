import { useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { useCartStore, selectGroupedByVendor, selectSubtotal } from "../store/useCartStore";
import { formatCurrency } from "../utils/formatCurrency";
import { INDIAN_STATES_AND_UTS } from "../data/indianStates";
import { createOrder, type OrderResponse } from "../api/ordersApi";
import { initiatePayment } from "../api/paymentsApi";
import { loadRazorpayCheckout } from "../utils/loadRazorpayCheckout";
import { ApiError } from "../api/httpClient";
import { CheckoutStatusPanel, type CheckoutPhase } from "../components/CheckoutStatusPanel";
import type { RazorpayFailureResponse, RazorpaySuccessResponse } from "../types/razorpay";

// PHONE regex matches the exact server-side contract from REACHX_TRACK_C_SESSION_PLAN.md /
// MASTER_BLUEPRINT.md - Indian mobile numbers, first digit 6-9, 10 digits total.
const PHONE_PATTERN = /^[6-9]\d{9}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Real Razorpay Key ID (the public "key id", not a secret) - required by the widget's `key`
// option but NOT part of the documented InitiatePaymentResponse shape ({ gateway,
// gatewayReference, amount, currency, rawGatewayResponse }). Standard Razorpay web-checkout
// integrations configure this as a frontend build-time value (it's meant to be public), separate
// from the per-order gatewayReference the backend returns - it is NOT assumed to be embedded in
// rawGatewayResponse, since that field is confirmed to be an opaque String (C-OQ3) rather than
// something this client parses. FLAG: unconfirmed against the real deploy config - if
// VITE_RAZORPAY_KEY_ID isn't actually set, the widget can't open (handled explicitly below, not
// a silent failure).
const RAZORPAY_KEY_ID = import.meta.env.VITE_RAZORPAY_KEY_ID as string | undefined;

interface FormState {
  customerEmail: string;
  customerPhone: string;
  shippingAddress: string;
  customerState: string;
}

interface FormErrors {
  customerEmail?: string;
  customerPhone?: string;
  shippingAddress?: string;
  customerState?: string;
}

const EMPTY_FORM: FormState = {
  customerEmail: "",
  customerPhone: "",
  shippingAddress: "",
  customerState: "",
};

function validate(form: FormState): FormErrors {
  const errors: FormErrors = {};
  if (!EMAIL_PATTERN.test(form.customerEmail)) {
    errors.customerEmail = "Enter a valid email address.";
  }
  if (!PHONE_PATTERN.test(form.customerPhone)) {
    errors.customerPhone = "Enter a valid 10-digit Indian mobile number.";
  }
  if (form.shippingAddress.trim().length < 10) {
    errors.shippingAddress = "Enter a complete shipping address.";
  }
  if (!form.customerState) {
    errors.customerState = "Select your state.";
  }
  return errors;
}

// Doesn't consume StorefrontOutletContext's pushToast - Session 2 used it for the "not wired up
// yet" stub, but every phase in this real flow now has its own dedicated screen/inline error
// (CheckoutStatusPanel, orderError below) rather than a toast layered on top of it, avoiding the
// exact kind of duplicated messaging the KYC panel had to fix in an earlier vendor-track pass.
export function CheckoutFormRoute() {
  const items = useCartStore((s) => s.items);
  const clearCart = useCartStore((s) => s.clear);

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [orderError, setOrderError] = useState<string | null>(null);

  // `phase === null` means "showing the form" - kept as its own state (rather than folding into
  // CheckoutStatusPanel's CheckoutPhase union) so the empty-cart guard below and the two-column
  // form+summary layout only render for that one case, with everything past order creation
  // handled by the single full-width status panel.
  const [phase, setPhase] = useState<CheckoutPhase | null>(null);
  const [order, setOrder] = useState<OrderResponse | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Guards against the Razorpay widget's `open()` (or a stray double-click on Retry Payment)
  // firing a second concurrent initiate call - duplicate-submit protection on the pay button
  // itself, not just the initial form submit.
  const isBusyRef = useRef(false);

  // Guard: checkout with nothing in the cart isn't a real state to render a form for - send the
  // guest back to the cart instead of a blank/zero-total checkout page. Only applies while still
  // on the form - once an order exists (post-submit), the cart may already be empty (cleared on
  // payment success) without that meaning "go back to /cart".
  if (items.length === 0 && phase === null) {
    return <Navigate to="/cart" replace />;
  }

  function handleChange<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
    // Clear a field's own error the moment it's edited, rather than waiting for the next submit
    // attempt to re-validate it.
    if (errors[field]) {
      setErrors((e) => ({ ...e, [field]: undefined }));
    }
  }

  function openRazorpayWidget(gatewayReference: string, amount: number, currency: string, placedOrder: OrderResponse) {
    // Captured into a local so TS narrows it once, rather than relying on `window.Razorpay`
    // staying narrowed across the whole function body after the guard below.
    const RazorpayCtor = window.Razorpay;
    if (!RazorpayCtor) {
      // loadRazorpayCheckout() already resolved by the time this is called - this guards the
      // TypeScript narrowing, not a real runtime path.
      setPaymentError("The payment widget didn't load correctly. Please try again.");
      setPhase("payment-failed");
      isBusyRef.current = false;
      return;
    }

    const rzp = new RazorpayCtor({
      key: RAZORPAY_KEY_ID ?? "",
      // Razorpay's widget takes the smallest currency unit (paise for INR), not rupees.
      // `InitiatePaymentResponse.amount`'s unit isn't confirmed against the real
      // `RazorpayGateway.java` - assumed to be rupees (matching every other money field in this
      // API, e.g. OrderResponse.totalAmount) and converted here. FLAG: verify this before
      // trusting a live charge amount - a wrong assumption here means a 100x-wrong charge either
      // direction.
      amount: Math.round(amount * 100),
      currency,
      name: "ReachX Marketplace",
      description: `Order ${placedOrder.orderNumber}`,
      order_id: gatewayReference,
      prefill: {
        email: form.customerEmail,
        contact: form.customerPhone,
      },
      theme: { color: "#1E254C" },
      handler: (_response: RazorpaySuccessResponse) => {
        // Razorpay's own client-side success callback - the best available signal in this build
        // (no public verify/status endpoint exists, C-OQ4), but not a server-confirmed truth.
        // Cart is cleared immediately: the charge has actually happened on Razorpay's side by
        // this point, so a guest navigating away mid-interstitial shouldn't come back to a stale
        // cart for an order that's already been paid for.
        clearCart();
        setPhase("processing");
        isBusyRef.current = false;
        // Deliberate, honest UX pause (not a real backend wait - see CheckoutStatusPanel's
        // "processing" phase comment) before landing on the appropriately-worded success screen.
        window.setTimeout(() => setPhase("success"), 1200);
      },
      modal: {
        ondismiss: () => {
          isBusyRef.current = false;
          setPhase("payment-cancelled");
        },
      },
    });

    rzp.on("payment.failed", (response: RazorpayFailureResponse) => {
      isBusyRef.current = false;
      setPaymentError(response.error?.description || "The payment couldn't be completed.");
      setPhase("payment-failed");
    });

    rzp.open();
  }

  async function startPayment(placedOrder: OrderResponse) {
    if (!RAZORPAY_KEY_ID) {
      setPaymentError(
        "Payment isn't configured in this environment (missing Razorpay key). Please try again later."
      );
      setPhase("payment-failed");
      isBusyRef.current = false;
      return;
    }

    setPhase("awaiting-gateway");
    try {
      const [initiateResult] = await Promise.all([
        initiatePayment(placedOrder.id, "RAZORPAY"),
        loadRazorpayCheckout(),
      ]);
      openRazorpayWidget(initiateResult.gatewayReference, initiateResult.amount, initiateResult.currency, placedOrder);
    } catch (err) {
      isBusyRef.current = false;
      setPaymentError(err instanceof Error ? err.message : "Couldn't start the payment.");
      setPhase("payment-failed");
    }
  }

  // Manual, explicit retry only - reuses the existing order (`order.id`), never creates a second
  // one and never fires on its own. Matches the plan's "never auto-retry payment initiation"
  // rule (silent auto-retry risks a double charge) for both the payment-failed and
  // payment-cancelled panels.
  function handleRetryPayment() {
    if (isBusyRef.current || !order) return;
    isBusyRef.current = true;
    setPaymentError(null);
    startPayment(order);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusyRef.current) return; // duplicate-submit protection

    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    isBusyRef.current = true;
    setOrderError(null);
    setPhase("creating-order");

    try {
      const placedOrder = await createOrder({
        customerEmail: form.customerEmail,
        customerPhone: form.customerPhone,
        shippingAddress: form.shippingAddress,
        customerState: form.customerState,
        items: items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
      });
      setOrder(placedOrder);
      await startPayment(placedOrder);
    } catch (err) {
      isBusyRef.current = false;
      setPhase(null); // back to the form - order was never created, so this is a real resubmit
      setOrderError(
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Couldn't place your order."
      );
    }
  }

  // Past the form entirely once an order exists (or is being created) - a single full-width
  // status panel for creating-order → awaiting-gateway → processing → success/failed/cancelled,
  // rather than the two-column form+summary layout persisting underneath it.
  if (phase !== null) {
    return (
      <CheckoutStatusPanel
        phase={phase}
        order={order}
        paymentError={paymentError}
        onRetryPayment={handleRetryPayment}
      />
    );
  }

  const groups = selectGroupedByVendor(items);
  const subtotal = selectSubtotal(items);

  return (
    <div className="grid gap-8 pb-6 lg:grid-cols-[1fr_360px]">
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <h1 className="font-display text-2xl font-bold text-brand-indigo">Checkout</h1>

        {orderError && (
          <div className="rounded-md border border-tint-chilli-border bg-tint-chilli-bg px-4 py-3 text-sm text-tint-chilli-text">
            {orderError}
          </div>
        )}

        <div>
          <label htmlFor="customerEmail" className="mb-1 block text-sm font-semibold text-brand-indigo">
            Email
          </label>
          <input
            id="customerEmail"
            type="email"
            value={form.customerEmail}
            onChange={(e) => handleChange("customerEmail", e.target.value)}
            aria-invalid={Boolean(errors.customerEmail)}
            aria-describedby={errors.customerEmail ? "customerEmail-error" : undefined}
            className="w-full min-h-[44px] rounded-md border border-brand-indigo/15 bg-white px-3 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          />
          {errors.customerEmail && (
            <p id="customerEmail-error" className="mt-1 text-xs font-medium text-tint-chilli-text">
              {errors.customerEmail}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="customerPhone" className="mb-1 block text-sm font-semibold text-brand-indigo">
            Phone
          </label>
          <input
            id="customerPhone"
            type="tel"
            inputMode="numeric"
            value={form.customerPhone}
            onChange={(e) => handleChange("customerPhone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            aria-invalid={Boolean(errors.customerPhone)}
            aria-describedby={errors.customerPhone ? "customerPhone-error" : undefined}
            placeholder="10-digit mobile number"
            className="w-full min-h-[44px] rounded-md border border-brand-indigo/15 bg-white px-3 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          />
          {errors.customerPhone && (
            <p id="customerPhone-error" className="mt-1 text-xs font-medium text-tint-chilli-text">
              {errors.customerPhone}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="shippingAddress" className="mb-1 block text-sm font-semibold text-brand-indigo">
            Shipping address
          </label>
          <textarea
            id="shippingAddress"
            rows={3}
            value={form.shippingAddress}
            onChange={(e) => handleChange("shippingAddress", e.target.value)}
            aria-invalid={Boolean(errors.shippingAddress)}
            aria-describedby={errors.shippingAddress ? "shippingAddress-error" : undefined}
            className="w-full rounded-md border border-brand-indigo/15 bg-white p-3 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          />
          {errors.shippingAddress && (
            <p id="shippingAddress-error" className="mt-1 text-xs font-medium text-tint-chilli-text">
              {errors.shippingAddress}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="customerState" className="mb-1 block text-sm font-semibold text-brand-indigo">
            State
          </label>
          {/* Fixed dropdown, not free text - scope call: customerState drives CGST+SGST vs IGST
              server-side, so a typo'd free-text value would silently produce the wrong tax
              split with no client-side way to catch it. See indianStates.ts. Its option strings
              are still unconfirmed against what POST /orders's GST engine actually expects
              (display name vs. an ISO 3166-2:IN code) - flagged there since Session 2, still
              open; this session doesn't resolve it, only wires the live call through it. */}
          <select
            id="customerState"
            value={form.customerState}
            onChange={(e) => handleChange("customerState", e.target.value)}
            aria-invalid={Boolean(errors.customerState)}
            aria-describedby={errors.customerState ? "customerState-error" : undefined}
            className="w-full min-h-[44px] rounded-md border border-brand-indigo/15 bg-white px-3 text-sm text-brand-indigo
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          >
            <option value="">Select state</option>
            {INDIAN_STATES_AND_UTS.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
          {errors.customerState && (
            <p id="customerState-error" className="mt-1 text-xs font-medium text-tint-chilli-text">
              {errors.customerState}
            </p>
          )}
        </div>

        <button
          type="submit"
          className="min-h-[44px] w-full rounded-md bg-brand-saffron px-4 text-sm font-bold text-white transition
            hover:bg-brand-saffron/90 disabled:cursor-not-allowed disabled:opacity-60
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron"
        >
          Continue to Payment
        </button>
      </form>

      {/* Read-only order summary - same vendor grouping/subtotal the cart page uses, not
          re-derived separately. Cart-based (not yet the authoritative POST /orders numbers) since
          this only renders pre-submit; the status panel switches to the real order breakdown. */}
      <aside className="h-fit space-y-3 rounded-lg border border-brand-indigo/10 bg-white p-4 shadow-premium-card">
        <h2 className="font-display text-base font-bold text-brand-indigo">Order Summary</h2>
        {groups.map((group) => (
          <div key={group.vendorId} className="border-b border-brand-indigo/5 pb-2 text-sm last:border-0">
            <p className="mb-1 text-xs font-semibold text-slate-500">Seller #{group.vendorId}</p>
            {group.items.map((item) => (
              <div key={item.productId} className="flex items-center justify-between text-xs text-slate-600">
                <span className="line-clamp-1">{item.name} × {item.quantity}</span>
                <span>{formatCurrency(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
        ))}
        <div className="flex items-center justify-between text-sm font-semibold text-brand-indigo">
          <span>Subtotal</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
        <p className="text-xs text-slate-400">Tax and shipping calculated at checkout.</p>
      </aside>
    </div>
  );
}
