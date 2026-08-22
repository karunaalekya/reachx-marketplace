import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { useAuthStore } from "../auth/store/useAuthStore";

// Same posture as App.interaction.test.tsx: NOT a live-backend test - no real Spring Boot
// server was reachable from this sandbox. Mounts the real component tree in jsdom, drives real
// nav clicks through the real router/stores/API wrappers, mocks only the fetch() boundary.
// Added this pass to close the gap flagged in FRONTEND_STATE.md's "Immediate next step" #3:
// OrdersPanel/DisputesPanel had zero test coverage - only login + KYC upload/retry were
// exercised. This does NOT touch the still-open end-to-end-against-a-real-backend gap noted in
// PROJECT_STATE.md (2026-08-21) - that requires an actual running Spring Boot instance, which
// this sandbox still can't reach (no Docker/Maven Central access here either).

const ORDERS_URL_PREFIX = "http://localhost:8080/api/v1/orders/mine";
const ORDER_STATUS_COUNTS_URL = "http://localhost:8080/api/v1/orders/mine/status-counts";
const DISPUTES_URL_PREFIX = "http://localhost:8080/api/v1/disputes/mine";

function mockFetchSequence(handlers: Array<(url: string) => Response>) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const handler = handlers[call];
      call += 1;
      if (!handler) {
        throw new Error(`Unexpected extra fetch call to ${url} (call #${call})`);
      }
      return handler(url);
    })
  );
}

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Bad Request",
    json: async () => body,
  } as Response;
}

const LOGIN_SUCCESS_BODY = {
  token: "fake-jwt-token",
  role: "VENDOR",
  userId: 1,
  displayName: "Placeholder Vendor",
};

function emptyPage<T>() {
  return {
    content: [] as T[],
    totalElements: 0,
    totalPages: 0,
    number: 0,
    size: 20,
    first: true,
    last: true,
    empty: true,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
  useAuthStore.getState().logout();
});

// Drives the real login form, then the real "Home" -> ActionCenterCard mount fetches
// (KYC documents + account health), same handler shape App.interaction.test.tsx already uses.
async function loginAndReachHome() {
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("you@business.com"), {
    target: { value: "vendor@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: "correct-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
  await screen.findByText("Action Center");
}

describe("OrdersPanel - real nav, real store, mocked fetch boundary", () => {
  it("loads the All tab on mount and renders a real order row with its shipment badge", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]), // ActionCenterCard's KYC fetch on Home
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      (url) => {
        // OrdersPanel's mount effect: fetchOrders then fetchStatusCounts
        expect(url.startsWith(ORDERS_URL_PREFIX)).toBe(true);
        return jsonResponse({
          content: [
            {
              orderId: 501,
              orderNumber: "RX-501",
              orderStatus: "PAID",
              items: [
                { productId: 9, productName: "Cotton Kurta", unitPrice: 799, quantity: 2, lineTotal: 1598 },
              ],
              vendorSubtotal: 1598,
              shipment: {
                id: 1,
                orderId: 501,
                vendorId: 1,
                awbNumber: "AWB123",
                courierName: "Delhivery",
                status: "SHIPPED",
                failureReason: null,
                shipByDeadline: new Date(Date.now() + 86400000).toISOString(),
                overdue: false,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              createdAt: new Date().toISOString(),
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          empty: false,
        });
      },
      (url) => {
        expect(url).toBe(ORDER_STATUS_COUNTS_URL);
        return jsonResponse({
          PENDING_PAYMENT: 0,
          PAID: 1,
          PAYMENT_FAILED: 0,
          CANCELLED: 0,
          FULFILLED: 0,
          REFUNDED: 0,
          PARTIALLY_REFUNDED: 0,
        });
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));

    expect(await screen.findByText("RX-501")).toBeInTheDocument();
    expect(screen.getByText("Shipped")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("switching tabs refetches page 0 under the new status filter", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse(emptyPage()), // initial All-tab fetch
      () =>
        jsonResponse({
          PENDING_PAYMENT: 0,
          PAID: 0,
          PAYMENT_FAILED: 0,
          CANCELLED: 0,
          FULFILLED: 0,
          REFUNDED: 0,
          PARTIALLY_REFUNDED: 2,
        }),
      (url) => {
        // Clicking the "Cancelled" tab must refetch with ?status=CANCELLED, page reset to 0.
        expect(url).toContain("status=CANCELLED");
        expect(url).toContain("page=0");
        return jsonResponse(emptyPage());
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    await screen.findByText("No orders in this view yet.");

    // Accessible name includes the count badge text (e.g. "Cancelled 0"), not just the label -
    // matched with a regex rather than an exact string for that reason.
    fireEvent.click(screen.getByRole("tab", { name: /^Cancelled/ }));

    await waitFor(() =>
      expect(screen.getByRole("tab", { name: /^Cancelled/ })).toHaveAttribute("aria-selected", "true")
    );
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("flags an overdue shipment distinctly from its normal status badge", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () =>
        jsonResponse({
          content: [
            {
              orderId: 777,
              orderNumber: "RX-777",
              orderStatus: "PAID",
              items: [{ productId: 3, productName: "Table Lamp", unitPrice: 1200, quantity: 1, lineTotal: 1200 }],
              vendorSubtotal: 1200,
              shipment: {
                id: 2,
                orderId: 777,
                vendorId: 1,
                awbNumber: null,
                courierName: null,
                status: "PICKUP_SCHEDULED",
                failureReason: null,
                shipByDeadline: new Date(Date.now() - 86400000).toISOString(),
                overdue: true,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              createdAt: new Date().toISOString(),
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          empty: false,
        }),
      () =>
        jsonResponse({
          PENDING_PAYMENT: 0,
          PAID: 1,
          PAYMENT_FAILED: 0,
          CANCELLED: 0,
          FULFILLED: 0,
          REFUNDED: 0,
          PARTIALLY_REFUNDED: 0,
        }),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));
    await screen.findByText("RX-777");

    // The row-level badge reads "Overdue" (not the raw shipment status) - asserts the real
    // overdue branch in ShipmentBadge, not just that the row rendered at all.
    expect(screen.getByText("Overdue")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { expanded: false }));
    expect(await screen.findByText("Past ship-by deadline")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a real fetch error in the banner without crashing the tab bar", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse({ message: "Order service unavailable" }, false, 503),
      () =>
        jsonResponse({
          PENDING_PAYMENT: 0,
          PAID: 0,
          PAYMENT_FAILED: 0,
          CANCELLED: 0,
          FULFILLED: 0,
          REFUNDED: 0,
          PARTIALLY_REFUNDED: 0,
        }),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Orders" }));

    expect(await screen.findByText("Order service unavailable")).toBeInTheDocument();
    // Tabs still render even though the list fetch failed - the error is scoped to the list.
    expect(screen.getByRole("tab", { name: "All" })).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

describe("DisputesPanel - real nav, real store, mocked fetch boundary, read-only", () => {
  it("loads and renders a real dispute row with its resolution notes", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      (url) => {
        expect(url.startsWith(DISPUTES_URL_PREFIX)).toBe(true);
        return jsonResponse({
          content: [
            {
              id: 42,
              orderId: 501,
              vendorId: 1,
              raisedByEmail: "customer@example.com",
              category: "ITEM_DAMAGED",
              description: "Box arrived crushed.",
              status: "RESOLVED_REFUNDED",
              resolutionNotes: "Full refund issued.",
              resolvedAt: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
          totalElements: 1,
          totalPages: 1,
          number: 0,
          size: 20,
          first: true,
          last: true,
          empty: false,
        });
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Disputes" }));

    expect(await screen.findByText(/Order #501 · Item damaged/)).toBeInTheDocument();
    expect(screen.getByText("Resolved - refunded")).toBeInTheDocument();
    expect(screen.getByText(/Full refund issued\./)).toBeInTheDocument();
    // Read-only surface: no raise/resolve controls anywhere on this panel.
    expect(screen.queryByRole("button", { name: /raise/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /resolve/i })).not.toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows the empty state when a vendor has no disputes", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse(emptyPage()),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Disputes" }));

    expect(await screen.findByText("No disputes on your orders.")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("surfaces a real fetch error in the banner", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse({ message: "Dispute service unavailable" }, false, 503),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Disputes" }));

    expect(await screen.findByText("Dispute service unavailable")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
