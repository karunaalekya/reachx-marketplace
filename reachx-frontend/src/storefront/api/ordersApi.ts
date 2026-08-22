import { apiFetch } from "./httpClient";

// Exact POST /orders contract from REACHX_TRACK_C_SESSION_PLAN.md / MASTER_BLUEPRINT.md.

export interface CreateOrderItem {
  productId: number;
  quantity: number;
}

export interface CreateOrderRequest {
  customerEmail: string;
  customerPhone: string; // ^[6-9]\d{9}$, validated client-side in CheckoutFormRoute.tsx already
  shippingAddress: string;
  customerState: string;
  items: CreateOrderItem[];
}

export interface OrderLineItem {
  productId: number;
  vendorId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface OrderResponse {
  id: number;
  orderNumber: string;
  status: string;
  subtotalAmount: number;
  shippingFeeAmount: number;
  taxAmount: number;
  totalAmount: number;
  customerState: string;
  items: OrderLineItem[];
  vendorSubtotals: Record<string, number>;
  createdAt: string;
}

// One real network call, no client-side retry loop here - if it fails, CheckoutFormRoute shows
// the unwrapped error inline and re-enables the form for a fresh, explicit resubmit. That's a new
// order-creation attempt, not the "never auto-retry" payment-initiation rule below (which is
// about not re-charging an *existing* order, not about this step).
export function createOrder(payload: CreateOrderRequest): Promise<OrderResponse> {
  return apiFetch<OrderResponse>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
