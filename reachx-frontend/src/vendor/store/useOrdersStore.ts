import { create } from "zustand";
import { OrderStatus, VendorOrder, getMyOrderStatusCounts, listMyOrders } from "../api/ordersApi";

// Same reasoning as usePayoutStore.ts: no persist middleware. Order contents (product names,
// prices, quantities, shipment AWB/courier) are live business data, refetched on mount/focus
// rather than cached across a reload.

// `null` = the "All" tab. Kept distinct from any real OrderStatus value so a zero-order status
// (e.g. no CANCELLED orders yet) can't be confused with "no filter selected".
export type OrderTab = OrderStatus | null;

interface OrdersState {
  vendorId: number | null;
  activeTab: OrderTab;
  orders: VendorOrder[];
  statusCounts: Record<OrderStatus, number> | null;
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;

  setVendorContext: (vendorId: number) => void;
  setActiveTab: (tab: OrderTab) => void;
  fetchOrders: (token: string, page?: number) => Promise<void>;
  fetchStatusCounts: (token: string) => Promise<void>;
}

export const useOrdersStore = create<OrdersState>()((set, get) => ({
  vendorId: null,
  activeTab: null,
  orders: [],
  statusCounts: null,
  page: 0,
  totalPages: 0,
  isLoading: false,
  error: null,

  setVendorContext: (vendorId) => set({ vendorId }),

  // Switching tabs refetches page 0 under the new filter - a stale page number from a
  // differently-filtered list wouldn't mean anything against the new one.
  setActiveTab: (tab) => set({ activeTab: tab, page: 0 }),

  fetchOrders: async (token, page) => {
    const targetPage = page ?? get().page;
    set({ isLoading: true, error: null });
    try {
      const result = await listMyOrders(token, get().activeTab, targetPage);
      set({
        orders: result.content,
        page: result.number,
        totalPages: result.totalPages,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load orders.",
      });
    }
  },

  // Kept as its own call, not folded into fetchOrders, because the tab bar needs counts for
  // every status up front (to render badge numbers on tabs the vendor hasn't clicked into yet),
  // while fetchOrders only ever returns the currently active tab's page.
  fetchStatusCounts: async (token) => {
    try {
      const statusCounts = await getMyOrderStatusCounts(token);
      set({ statusCounts });
    } catch (err) {
      // Deliberately not surfaced via the shared `error` field - a failed count-badge fetch
      // shouldn't block or blank out the order list itself, which is the more important half
      // of this screen. Tabs just render without badge numbers until the next successful fetch.
      console.error("Failed to load order status counts:", err);
    }
  },
}));
