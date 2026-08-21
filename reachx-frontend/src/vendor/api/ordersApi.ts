// Checked directly against karunaalekya/reachx-marketplace's marketplace-springboot source
// (OrderController, OrderService, VendorOrderResponse, ShipmentResponse, Order.OrderStatus,
// Shipment.ShipmentStatus) - not inferred. Same discipline as payoutApi.ts.

import type { Page } from "./payoutApi";

// Order.OrderStatus - the real enum, verbatim.
export type OrderStatus =
  | "PENDING_PAYMENT"
  | "PAID"
  | "PAYMENT_FAILED"
  | "CANCELLED"
  | "FULFILLED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

// Shipment.ShipmentStatus - the real enum, verbatim. A vendor's order can have no shipment yet
// (e.g. PENDING_PAYMENT orders never get one) - `shipment` on VendorOrder is nullable for that
// reason, not an oversight.
export type ShipmentStatus =
  | "PENDING"
  | "CREATED"
  | "PICKUP_SCHEDULED"
  | "SHIPPED"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "FAILED"
  | "RTO";

export interface VendorOrderItem {
  productId: number;
  productName: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

// ShipmentResponse - `overdue` is computed server-side (Instant.now().isAfter(shipByDeadline) &&
// still in a pre-ship status) - deliberately NOT recomputed client-side from shipByDeadline alone,
// since "now" drifts between the response being generated and rendered, and re-deriving it here
// risks disagreeing with the backend's own definition of overdue.
export interface VendorShipment {
  id: number;
  orderId: number;
  vendorId: number;
  awbNumber: string | null;
  courierName: string | null;
  status: ShipmentStatus;
  failureReason: string | null;
  shipByDeadline: string | null;
  overdue: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VendorOrder {
  orderId: number;
  orderNumber: string;
  orderStatus: OrderStatus;
  items: VendorOrderItem[];
  vendorSubtotal: number;
  shipment: VendorShipment | null;
  createdAt: string;
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api/v1";

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function unwrap<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message ?? `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// GET /orders/mine?status=X - status omitted fetches every status (the "All" tab).
export async function listMyOrders(
  token: string,
  status: OrderStatus | null,
  page = 0,
  size = 20
): Promise<Page<VendorOrder>> {
  const params = new URLSearchParams({ page: String(page), size: String(size), sort: "createdAt,desc" });
  if (status) params.set("status", status);
  const res = await fetch(`${API_BASE}/orders/mine?${params.toString()}`, {
    headers: authHeaders(token),
  });
  return unwrap<Page<VendorOrder>>(res);
}

// GET /orders/mine/status-counts - zero-filled server-side for every OrderStatus value, so this
// is always safe to index without an `?? 0` fallback at the call site.
export async function getMyOrderStatusCounts(
  token: string
): Promise<Record<OrderStatus, number>> {
  const res = await fetch(`${API_BASE}/orders/mine/status-counts`, {
    headers: authHeaders(token),
  });
  return unwrap<Record<OrderStatus, number>>(res);
}
