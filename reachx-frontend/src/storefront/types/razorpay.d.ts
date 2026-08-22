// Minimal ambient types for Razorpay's web Checkout widget. Razorpay ships this as a plain
// <script src="https://checkout.razorpay.com/v1/checkout.js"> include, not an npm package -
// there's no @types package to install instead. Only the surface this app actually uses is
// typed here; Razorpay's real SDK has a much larger options/events surface than this.

export interface RazorpayCheckoutOptions {
  key: string;
  amount: number; // smallest currency unit - paise for INR, see loadRazorpayCheckout.ts caller
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: {
    email?: string;
    contact?: string;
  };
  theme?: {
    color?: string;
  };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: {
    ondismiss?: () => void;
  };
}

export interface RazorpaySuccessResponse {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

export interface RazorpayFailureResponse {
  error: {
    code: string;
    description: string;
    source?: string;
    step?: string;
    reason?: string;
  };
}

export interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", handler: (response: RazorpayFailureResponse) => void) => void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

export {};
