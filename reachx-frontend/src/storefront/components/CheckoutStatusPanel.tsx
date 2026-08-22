import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, ShieldAlert, XCircle } from "lucide-react";
import type { OrderResponse } from "../api/ordersApi";
import { formatCurrency } from "../utils/formatCurrency";

export type CheckoutPhase =
  | "creating-order"
  | "awaiting-gateway"
  | "processing"
  | "success"
  | "payment-failed"
  | "payment-cancelled";

interface CheckoutStatusPanelProps {
  phase: CheckoutPhase;
  order: OrderResponse | null;
  paymentError: string | null;
  onRetryPayment: () => void;
}

function OrderBreakdown({ order }: { order: OrderResponse }) {
  // Authoritative numbers from POST /orders, not re-derived from the cart - per the plan, cart
  // only ever shows a subtotal pre-checkout ("tax/shipping calculated at checkout").
  return (
    <div className="w-full space-y-2 rounded-lg border border-brand-indigo/10 bg-surface-cardMuted/60 p-4 text-left text-sm">
      {Object.entries(order.vendorSubtotals).map(([vendorId, amount]) => (
        <div key={vendorId} className="flex items-center justify-between text-slate-500">
          <span>Seller #{vendorId}</span>
          <span>{formatCurrency(amount)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between border-t border-brand-indigo/10 pt-2 text-slate-500">
        <span>Subtotal</span>
        <span>{formatCurrency(order.subtotalAmount)}</span>
      </div>
      <div className="flex items-center justify-between text-slate-500">
        <span>Shipping</span>
        <span>{formatCurrency(order.shippingFeeAmount)}</span>
      </div>
      <div className="flex items-center justify-between text-slate-500">
        <span>Tax</span>
        <span>{formatCurrency(order.taxAmount)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-brand-indigo/10 pt-2 font-display text-base font-bold text-brand-indigo">
        <span>Total</span>
        <span>{formatCurrency(order.totalAmount)}</span>
      </div>
    </div>
  );
}

export function CheckoutStatusPanel({ phase, order, paymentError, onRetryPayment }: CheckoutStatusPanelProps) {
  if (phase === "creating-order") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
        <Loader2 size={28} className="animate-spin text-brand-saffron" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Placing your order…</p>
      </div>
    );
  }

  if (phase === "awaiting-gateway") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card" role="status">
        <Loader2 size={28} className="animate-spin text-brand-saffron" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Opening secure payment…</p>
        <p className="text-sm text-slate-500">A Razorpay payment window will open in a moment.</p>
      </div>
    );
  }

  if (phase === "processing") {
    // The explicit "don't close this window" interstitial the plan requires between the
    // gateway's client-side success callback and the result screen. Worth being honest about
    // what this actually is: a brief, deliberate pause for the guest to read this message, not a
    // live wait on a real backend verify call - no public payment verify/status endpoint exists
    // (C-OQ4), and GET /orders/{id} is ADMIN-only as of 2026-08-21. The success screen that
    // follows is worded accordingly (see phase === "success" below) rather than claiming a
    // server-confirmed "Payment Successful" this build can't actually back up yet.
    return (
      <div
        className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card"
        role="status"
        aria-live="assertive"
      >
        <Loader2 size={28} className="animate-spin text-brand-saffron" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Processing payment</p>
        <p className="text-sm font-medium text-tint-chilli-text">Please don't close this window.</p>
      </div>
    );
  }

  if (phase === "success" && order) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-lg bg-white p-10 text-center shadow-premium-card">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-tint-neem-bg">
          <CheckCircle2 size={32} className="text-tint-neem-text" aria-hidden="true" />
        </span>
        <div>
          <h1 className="font-display text-2xl font-bold text-brand-indigo">Order placed</h1>
          {/* Deliberately not "Payment confirmed" - see the processing-phase comment above for
              why this build can't claim server-verified confirmation yet. */}
          <p className="mt-1 text-sm text-slate-500">
            Your payment was submitted successfully. We'll email a confirmation to you shortly.
          </p>
        </div>

        <div className="w-full rounded-lg border border-brand-indigo/10 bg-surface-cardMuted/60 p-4 text-left text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Order ID</p>
          <p className="font-display text-lg font-bold text-brand-indigo">{order.id}</p>
          <p className="mt-1 text-xs text-slate-400">
            Save this - it's the value you'll use to look up and track this order later.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Order Number</p>
          <p className="text-sm text-slate-600">{order.orderNumber}</p>
        </div>

        <OrderBreakdown order={order} />

        <div className="flex w-full flex-col gap-2 sm:flex-row">
          <Link
            to="/"
            className="min-h-[44px] flex-1 rounded-md border border-brand-indigo/15 px-4 py-2 text-center text-sm font-semibold text-brand-indigo
              transition hover:border-brand-saffron hover:text-brand-saffron
              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-saffron"
          >
            Continue shopping
          </Link>
          <Link
            to={`/track-order?orderId=${order.id}`}
            className="min-h-[44px] flex-1 rounded-md bg-brand-indigo px-4 py-2 text-center text-sm font-semibold text-white transition
              hover:bg-brand-indigo/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo"
          >
            Track this order
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "payment-cancelled") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
        <ShieldAlert size={28} className="text-slate-400" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Payment wasn't completed</p>
        <p className="text-sm text-slate-500">You closed the payment window before it finished.</p>
        {order && (
          <p className="text-xs text-slate-400">
            Order #{order.id} is on file - retrying reuses it, no duplicate order is created.
          </p>
        )}
        <button
          type="button"
          onClick={onRetryPayment}
          className="mt-2 min-h-[44px] rounded-md bg-brand-saffron px-5 text-sm font-bold text-white transition
            hover:bg-brand-saffron/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron"
        >
          Retry Payment
        </button>
      </div>
    );
  }

  if (phase === "payment-failed") {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg bg-white p-16 text-center shadow-premium-card">
        <XCircle size={28} className="text-tint-chilli-text" aria-hidden="true" />
        <p className="font-display text-lg text-brand-indigo">Payment failed</p>
        <p className="text-sm text-slate-500">{paymentError ?? "The payment couldn't be completed."}</p>
        {order && (
          <p className="text-xs text-slate-400">
            Order #{order.id} is on file - retrying reuses it, no duplicate order is created.
          </p>
        )}
        {/* Manual, explicit retry only - never fired automatically, per the plan's rule that
            silent auto-retry on payment risks a double charge. */}
        <button
          type="button"
          onClick={onRetryPayment}
          className="mt-2 min-h-[44px] rounded-md bg-brand-saffron px-5 text-sm font-bold text-white transition
            hover:bg-brand-saffron/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-saffron"
        >
          Retry Payment
        </button>
      </div>
    );
  }

  return null;
}
