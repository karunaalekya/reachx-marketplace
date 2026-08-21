import { useEffect, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Truck, AlertTriangle } from "lucide-react";
import { useOrdersStore, OrderTab } from "../store/useOrdersStore";
import { useRefetchOnFocus } from "../../shared/hooks/useRefetchOnFocus";
import { StaggerReveal } from "../../shared/components/StaggerReveal";
import type { ShipmentStatus } from "../api/ordersApi";

// Checked directly against OrderController/OrderService/VendorOrderResponse/ShipmentResponse -
// GET /orders/mine (with optional ?status=), GET /orders/mine/status-counts. Tabs + badge counts
// mirror the real Amazon Seller Central / Flipkart Seller Hub pattern - a vendor never sees
// another vendor's items sharing the same order, only their own slice (enforced server-side in
// VendorOrderResponse.from, not re-filtered here).

const INR = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 });
const MONEY = "font-mono tabular-nums";

// Tab order deliberately follows the real order lifecycle, not alphabetical - matches how a
// vendor actually thinks about their queue (what needs action first).
const TABS: { key: OrderTab; label: string }[] = [
  { key: null, label: "All" },
  { key: "PAID", label: "Paid" },
  { key: "FULFILLED", label: "Fulfilled" },
  { key: "PENDING_PAYMENT", label: "Pending payment" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "REFUNDED", label: "Refunded" },
  { key: "PARTIALLY_REFUNDED", label: "Partial refund" },
  { key: "PAYMENT_FAILED", label: "Payment failed" },
];

const SHIPMENT_STATUS_LABEL: Record<ShipmentStatus, string> = {
  PENDING: "Preparing shipment",
  CREATED: "Shipment created",
  PICKUP_SCHEDULED: "Pickup scheduled",
  SHIPPED: "Shipped",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  FAILED: "Delivery failed",
  RTO: "Returned to origin",
};

interface OrdersPanelProps {
  vendorId: number;
  authToken: string;
}

export function OrdersPanel({ vendorId, authToken }: OrdersPanelProps) {
  const {
    activeTab,
    orders,
    statusCounts,
    page,
    totalPages,
    isLoading,
    error,
    setVendorContext,
    setActiveTab,
    fetchOrders,
    fetchStatusCounts,
  } = useOrdersStore();

  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  useEffect(() => {
    setVendorContext(vendorId);
    fetchOrders(authToken, 0);
    fetchStatusCounts(authToken);
    // Runs once per vendor identity - same pattern as VendorPayoutLedger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId]);

  useEffect(() => {
    // Refetches page 0 whenever the tab changes - setActiveTab already reset `page` to 0 in the
    // store, this just triggers the actual network call for the new filter.
    fetchOrders(authToken, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useRefetchOnFocus(() => {
    fetchOrders(authToken);
    fetchStatusCounts(authToken);
  });

  return (
    <div className="space-y-6">
      <StaggerReveal index={1}>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Order status">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const count = tab.key ? statusCounts?.[tab.key] : undefined;
            return (
              <button
                key={tab.label}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-indigo
                  ${isActive ? "bg-brand-indigo text-white" : "bg-white text-slate-500 shadow-premium-card hover:bg-surface-cardMuted"}`}
              >
                {tab.label}
                {count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-xs ${MONEY} ${
                      isActive ? "bg-white/20" : "bg-surface-cardMuted text-slate-400"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </StaggerReveal>

      {error && (
        <div className="rounded-md border-l-4 bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <StaggerReveal index={2}>
        <div className="rounded-lg bg-white shadow-premium-card overflow-hidden">
          {isLoading && orders.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">Loading orders…</div>
          ) : orders.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-slate-400">No orders in this view yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {orders.map((order) => {
                const isExpanded = expandedOrderId === order.orderId;
                return (
                  <li key={order.orderId}>
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.orderId)}
                      aria-expanded={isExpanded}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left
                        hover:bg-surface-cardMuted transition
                        focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-brand-indigo"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-indigo">{order.orderNumber}</p>
                        <p className="text-xs text-slate-400">
                          {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                          {new Date(order.createdAt).toLocaleDateString("en-IN")}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className={`text-sm font-bold text-brand-indigo ${MONEY}`}>
                          {INR.format(order.vendorSubtotal)}
                        </p>
                        <ShipmentBadge shipment={order.shipment} />
                        <ChevronDown
                          size={18}
                          className={`text-slate-400 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        />
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="px-5 pb-5 motion-safe:animate-shell-reveal">
                        <div className="rounded-md bg-surface-cardMuted p-4 shadow-premium-dropdown space-y-3">
                          <ul className="space-y-2">
                            {order.items.map((item) => (
                              <li key={item.productId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">
                                  {item.productName} × {item.quantity}
                                </span>
                                <span className={`text-brand-indigo font-medium ${MONEY}`}>
                                  {INR.format(item.lineTotal)}
                                </span>
                              </li>
                            ))}
                          </ul>

                          {order.shipment ? (
                            <div className="flex items-start gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
                              <Truck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
                              <div>
                                <p>
                                  {SHIPMENT_STATUS_LABEL[order.shipment.status]}
                                  {order.shipment.courierName && ` via ${order.shipment.courierName}`}
                                  {order.shipment.awbNumber && ` · AWB ${order.shipment.awbNumber}`}
                                </p>
                                {order.shipment.overdue && (
                                  <p className="mt-1 flex items-center gap-1 text-tint-chilli-text font-medium">
                                    <AlertTriangle size={12} aria-hidden="true" />
                                    Past ship-by deadline
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <p className="border-t border-slate-200 pt-3 text-xs text-slate-400">
                              No shipment created yet.
                            </p>
                          )}
                        </div>
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
              onClick={() => fetchOrders(authToken, page - 1)}
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
              onClick={() => fetchOrders(authToken, page + 1)}
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
    </div>
  );
}

function ShipmentBadge({ shipment }: { shipment: import("../api/ordersApi").VendorShipment | null }) {
  if (!shipment) {
    return (
      <span className="rounded-md border-l-4 px-2.5 py-1 text-xs font-medium bg-tint-muted-bg border-tint-muted-border text-tint-muted-text">
        No shipment
      </span>
    );
  }
  if (shipment.overdue) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border-l-4 px-2.5 py-1 text-xs font-medium bg-tint-chilli-bg border-tint-chilli-border text-tint-chilli-text">
        <AlertTriangle size={12} aria-hidden="true" />
        Overdue
      </span>
    );
  }
  const variant = shipment.status === "DELIVERED" ? "neem" : shipment.status === "FAILED" || shipment.status === "RTO" ? "chilli" : "saffron";
  return (
    <span
      className={`rounded-md border-l-4 px-2.5 py-1 text-xs font-medium bg-tint-${variant}-bg border-tint-${variant}-border text-tint-${variant}-text`}
    >
      {SHIPMENT_STATUS_LABEL[shipment.status]}
    </span>
  );
}
