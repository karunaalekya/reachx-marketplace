import { apiFetch } from "./httpClient";

// v1 builds Razorpay only, per the session plan (C-OQ3/C-OQ4): PayU has no JS widget - it needs
// a real auto-submitted `<form method="POST">` whose `rawGatewayResponse` submit-target mechanism
// is unconfirmed - and Cashfree isn't built this session either. This union only lists the one
// gateway actually wired; widen it (and build a real gateway-selector UI) only once C-OQ3 is
// resolved, per the plan's explicit instruction to keep PAYU hidden until then.
export type PaymentGateway = "RAZORPAY";

export interface InitiatePaymentResponse {
  gateway: PaymentGateway;
  gatewayReference: string;
  amount: number;
  currency: string;
  // Confirmed a String, not an object (C-OQ3) - not parsed or relied on by this client. Kept
  // typed as `string` rather than `unknown`/`any` so a future PayU path doesn't silently start
  // treating it as structured data without a deliberate decision to do so.
  rawGatewayResponse: string;
}

// Never called in an automatic retry loop from CheckoutFormRoute - a failed initiation surfaces
// a manual "Retry Payment" button instead, per the plan's "never auto-retry payment initiation"
// rule (silent auto-retry risks a double charge). The gateway default here is just this
// function's own default parameter, not a hidden retry mechanism.
export function initiatePayment(
  orderId: number,
  gateway: PaymentGateway = "RAZORPAY"
): Promise<InitiatePaymentResponse> {
  return apiFetch<InitiatePaymentResponse>(
    `/payments/orders/${orderId}/initiate?gateway=${gateway}`,
    { method: "POST" }
  );
}
