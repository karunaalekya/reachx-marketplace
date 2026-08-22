import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { useProductBrowseStore } from "../storefront/store/useProductBrowseStore";
import { useCartStore } from "../storefront/store/useCartStore";

// Same real-tree, mocked-fetch-boundary discipline as App.interaction.test.tsx: mounts the
// actual router/shell/store/API-wrapper chain and only stubs global fetch.

const PRODUCTS_URL_PREFIX = "http://localhost:8080/api/v1/products";

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
  return { ok, status, statusText: ok ? "OK" : "Bad Request", json: async () => body } as Response;
}

function pageOf(content: unknown[], overrides: Partial<Record<string, unknown>> = {}) {
  return {
    content,
    totalElements: content.length,
    totalPages: 1,
    number: 0,
    size: 24,
    first: true,
    last: true,
    empty: content.length === 0,
    ...overrides,
  };
}

const SAMPLE_PRODUCT = {
  id: 42,
  vendorId: 7,
  categoryId: null,
  name: "Handwoven Cotton Saree",
  description: "A soft handloom saree.",
  price: 1499,
  stockQuantity: 5,
  sku: "SAREE-42",
  status: "ACTIVE",
  createdAt: new Date().toISOString(),
  imageUrls: ["https://example.com/saree.jpg"],
};

// A prior pass had an unused OTHER_VENDOR_PRODUCT fixture here for the multi-vendor
// cart-grouping test - the eslint-disable comment silenced the linter but not tsc's real
// noUnusedLocals check (which `npm run build`/`tsc -b --noEmit` both enforce), so it still
// failed the actual build. That test constructs its two-vendor cart from inline item literals
// instead (see "groups a multi-vendor cart into separate per-vendor sections" below), so the
// fixture was genuinely dead code - removed rather than re-suppressed.

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  window.history.pushState({}, "", "/");
  // Real module-level zustand stores, not re-created per render - reset explicitly so one
  // test's fetched products / cart contents don't leak into the next.
  useProductBrowseStore.setState({
    filters: {},
    products: [],
    page: 0,
    totalPages: 0,
    totalElements: 0,
    isLoading: false,
    error: null,
  });
  useCartStore.setState({ items: [] });
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
  window.history.pushState({}, "", "/");
});

describe("Product browse grid - real tree, mocked fetch boundary", () => {
  it("loads and renders products from the real search endpoint on mount", async () => {
    mockFetchSequence([
      (url) => {
        expect(url.startsWith(PRODUCTS_URL_PREFIX)).toBe(true);
        return jsonResponse(pageOf([SAMPLE_PRODUCT]));
      },
    ]);

    render(<App />);

    expect(await screen.findByText("Handwoven Cotton Saree")).toBeInTheDocument();
    expect(screen.getByText("Seller #7")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows the real error message inline when the search request fails", async () => {
    mockFetchSequence([
      () =>
        jsonResponse(
          { error: "Something went wrong on our end", timestamp: new Date().toISOString(), status: 500 },
          false,
          500
        ),
    ]);

    render(<App />);

    expect(await screen.findByText("Something went wrong on our end")).toBeInTheDocument();
  });

  it("adds a product to the real cart from the grid card, no fetch involved", async () => {
    mockFetchSequence([() => jsonResponse(pageOf([SAMPLE_PRODUCT]))]);

    render(<App />);
    await screen.findByText("Handwoven Cotton Saree");

    fireEvent.click(screen.getByRole("button", { name: /Add Handwoven Cotton Saree to cart/i }));

    // Toast confirms the real add, not the Session 1 stub copy.
    expect(await screen.findByText("Added to cart")).toBeInTheDocument();
    expect(useCartStore.getState().items).toEqual([
      expect.objectContaining({ productId: 42, quantity: 1, vendorId: 7 }),
    ]);
    // Cart badge now shows a live count in the nav (both header and bottom tab bar render one -
    // assert at least one is present rather than assuming a single match).
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    // Cart is 100% local state - adding to it must never touch the network.
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches with the new price filter when Apply is clicked", async () => {
    mockFetchSequence([
      () => jsonResponse(pageOf([SAMPLE_PRODUCT])),
      (url) => {
        expect(url).toContain("minPrice=1000");
        expect(url).toContain("maxPrice=2000");
        return jsonResponse(pageOf([SAMPLE_PRODUCT]));
      },
    ]);

    render(<App />);
    await screen.findByText("Handwoven Cotton Saree");

    fireEvent.change(screen.getByPlaceholderText("Min ₹"), { target: { value: "1000" } });
    fireEvent.change(screen.getByPlaceholderText("Max ₹"), { target: { value: "2000" } });
    fireEvent.click(screen.getByRole("button", { name: "Apply" }));

    await waitFor(() => expect(useProductBrowseStore.getState().filters.minPrice).toBe(1000));
  });
});

describe("Product detail route - real tree, mocked fetch boundary", () => {
  it("navigates from the grid to the detail page and loads the real product", async () => {
    mockFetchSequence([
      () => jsonResponse(pageOf([SAMPLE_PRODUCT])),
      (url) => {
        expect(url).toBe(`${PRODUCTS_URL_PREFIX}/42`);
        return jsonResponse(SAMPLE_PRODUCT);
      },
    ]);

    render(<App />);
    await screen.findByText("Handwoven Cotton Saree");

    fireEvent.click(screen.getAllByRole("link", { name: "Handwoven Cotton Saree" })[0]);

    expect(await screen.findByText("A soft handloom saree.")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("treats a non-ACTIVE, non-OUT_OF_STOCK product as unavailable rather than rendering a buy flow", async () => {
    window.history.pushState({}, "", "/product/99");
    mockFetchSequence([
      () => jsonResponse({ ...SAMPLE_PRODUCT, id: 99, status: "ARCHIVED" }),
    ]);

    render(<App />);

    expect(await screen.findByText("This product isn't available")).toBeInTheDocument();
  });

  it("adds to cart from the product detail page's desktop button", async () => {
    window.history.pushState({}, "", "/product/42");
    mockFetchSequence([() => jsonResponse(SAMPLE_PRODUCT)]);

    render(<App />);
    await screen.findByText("A soft handloom saree.");

    fireEvent.click(screen.getByRole("button", { name: "Add to Cart" }));

    expect(await screen.findByText("Added to cart")).toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});

describe("Cart page - real tree, no fetch involved (100% local state)", () => {
  it("shows the empty-cart state with real copy when there's nothing in the cart", async () => {
    window.history.pushState({}, "", "/cart");
    mockFetchSequence([]);

    render(<App />);

    expect(await screen.findByText("Your cart is empty — explore products.")).toBeInTheDocument();
  });

  it("groups a multi-vendor cart into separate per-vendor sections with correct subtotals", async () => {
    useCartStore.setState({
      items: [
        { productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 2, vendorId: 7, imageUrl: null },
        { productId: 88, name: "Terracotta Table Lamp", price: 899, quantity: 1, vendorId: 19, imageUrl: null },
      ],
    });
    window.history.pushState({}, "", "/cart");
    mockFetchSequence([]);

    render(<App />);

    expect(await screen.findByText("Seller #7")).toBeInTheDocument();
    expect(screen.getByText("Seller #19")).toBeInTheDocument();
    // Vendor #7's subtotal: 1499 * 2 = 2998. Vendor #19's: 899 * 1 = 899. Cart subtotal: 3897.
    // Vendor #7 has a single line item, so its per-line total (₹2,998) coincidentally matches
    // its vendor subtotal too - query the vendor-subtotal testid specifically rather than plain
    // text so this doesn't collide with that line item's own total.
    expect(screen.getByTestId("vendor-subtotal-7")).toHaveTextContent("₹2,998");
    expect(screen.getByTestId("vendor-subtotal-19")).toHaveTextContent("₹899");
    expect(screen.getByText(/₹3,897/)).toBeInTheDocument();
    expect(screen.getByText("Tax and shipping calculated at checkout.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes the last item and falls back to the empty state", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/cart");
    mockFetchSequence([]);

    render(<App />);
    await screen.findByText("Handwoven Cotton Saree");

    fireEvent.click(screen.getByRole("button", { name: /Remove Handwoven Cotton Saree from cart/i }));

    expect(await screen.findByText("Your cart is empty — explore products.")).toBeInTheDocument();
  });
});

describe("Checkout form - validation and empty-cart guard", () => {
  it("redirects to /cart when checkout is visited with an empty cart", async () => {
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([]);

    render(<App />);

    expect(await screen.findByText("Your cart is empty — explore products.")).toBeInTheDocument();
  });

  it("blocks submit with inline errors on an invalid phone and a missing state", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([]);

    render(<App />);
    await screen.findByText("Checkout");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.com" } });
    fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "12345" } });
    fireEvent.change(screen.getByLabelText("Shipping address"), {
      target: { value: "123 MG Road, Bengaluru, 560001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue to Payment" }));

    expect(await screen.findByText("Enter a valid 10-digit Indian mobile number.")).toBeInTheDocument();
    expect(screen.getByText("Select your state.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  // The former third test here ("shows the honest 'not wired yet' toast on a valid submit")
  // asserted session 2's stub behavior - no fetch call, a "Checkout isn't wired up yet" toast.
  // Session 3 (below) replaced CheckoutFormRoute's submit handler with the real
  // createOrder/initiatePayment flow, so that expectation now contradicts the component's
  // actual (and intended) behavior. Removed rather than fixed - the real submit path is
  // covered by the "Session 3 - real order creation + Razorpay wiring" describe block below.
});

// --- Session 3 (C3 completion) - real order creation + Razorpay wiring ---
// Not run for real in this pass - same "reported, not verified" caveat FRONTEND_STATE.md's
// Session 2 entry already applies to that session's own untested diff: this sandbox has never
// had the full repo (package.json/vite.config.ts/etc. aren't part of either session's diff zip),
// so `npx vitest run` hasn't actually executed these new cases. Written to the same real-tree,
// mocked-fetch-boundary style as everything above, with `window.Razorpay` stubbed the same way -
// as an external <script> global, not an importable module, since that's genuinely how Razorpay
// ships it.

const ORDERS_URL = "http://localhost:8080/api/v1/orders";
const PAYMENTS_URL = "http://localhost:8080/api/v1/payments/orders/501/initiate?gateway=RAZORPAY";

const SAMPLE_ORDER = {
  id: 501,
  orderNumber: "RX-2026-000501",
  status: "PENDING_PAYMENT",
  subtotalAmount: 1499,
  shippingFeeAmount: 49,
  taxAmount: 269.82,
  totalAmount: 1817.82,
  customerState: "Karnataka",
  items: [
    { productId: 42, vendorId: 7, productName: "Handwoven Cotton Saree", unitPrice: 1499, quantity: 1, lineTotal: 1499 },
  ],
  vendorSubtotals: { "7": 1499 },
  createdAt: new Date().toISOString(),
};

const SAMPLE_INITIATE = {
  gateway: "RAZORPAY",
  gatewayReference: "order_RZP_abc123",
  amount: 1817.82,
  currency: "INR",
  rawGatewayResponse: "{}",
};

function fillValidCheckoutForm() {
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "guest@example.com" } });
  fireEvent.change(screen.getByLabelText("Phone"), { target: { value: "9876543210" } });
  fireEvent.change(screen.getByLabelText("Shipping address"), {
    target: { value: "123 MG Road, Bengaluru, 560001" },
  });
  fireEvent.change(screen.getByLabelText("State"), { target: { value: "Karnataka" } });
}

// Captures the options CheckoutFormRoute passes to `new window.Razorpay(...)` so a test can
// trigger `handler` (success), `modal.ondismiss` (cancel), or the `on("payment.failed", ...)`
// callback the same way the real widget would, without loading the real external script.
class MockRazorpay {
  static lastInstance: MockRazorpay | null = null;
  options: any;
  failureHandler: ((response: unknown) => void) | null = null;
  openCalls = 0;

  constructor(options: any) {
    this.options = options;
    MockRazorpay.lastInstance = this;
  }
  open() {
    this.openCalls += 1;
  }
  on(event: string, handler: (response: unknown) => void) {
    if (event === "payment.failed") this.failureHandler = handler;
  }
}

describe("Checkout - Session 3, order creation + Razorpay wiring", () => {
  beforeEach(() => {
    vi.stubEnv("VITE_RAZORPAY_KEY_ID", "rzp_test_dummy_key");
    (window as any).Razorpay = MockRazorpay;
    MockRazorpay.lastInstance = null;
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as any).Razorpay;
  });

  it("creates the order, initiates Razorpay, and reaches the success screen on the widget's success callback", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([
      (url) => {
        expect(url).toBe(ORDERS_URL);
        return jsonResponse(SAMPLE_ORDER);
      },
      (url) => {
        expect(url).toBe(PAYMENTS_URL);
        return jsonResponse(SAMPLE_INITIATE);
      },
    ]);

    render(<App />);
    await screen.findByText("Checkout");
    fillValidCheckoutForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Payment" }));

    // Widget opened with the real order/payment data, amount converted to paise.
    await waitFor(() => expect(MockRazorpay.lastInstance?.openCalls).toBe(1));
    expect(MockRazorpay.lastInstance?.options.order_id).toBe("order_RZP_abc123");
    expect(MockRazorpay.lastInstance?.options.amount).toBe(181782);
    expect(MockRazorpay.lastInstance?.options.key).toBe("rzp_test_dummy_key");

    // Simulate the widget's own client-side success callback.
    MockRazorpay.lastInstance?.options.handler({
      razorpay_payment_id: "pay_abc",
      razorpay_order_id: "order_RZP_abc123",
      razorpay_signature: "sig",
    });

    // Cart is cleared immediately on the callback, before the honest processing pause resolves.
    expect(useCartStore.getState().items).toHaveLength(0);
    expect(await screen.findByText("Processing payment")).toBeInTheDocument();
    // CheckoutFormRoute's success transition is a deliberate 1200ms real setTimeout (the
    // "honest processing pause" - not a real backend wait, but not instant either). RTL's
    // findByText default timeout is 1000ms, so without raising it here the query times out
    // ~200ms before the component ever calls setPhase("success") - a genuine race between the
    // test default and the component's real delay, not a stale assertion.
    expect(await screen.findByText("Order placed", {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText("501")).toBeInTheDocument();
    expect(screen.getByText("RX-2026-000501")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shows an inline error and returns to the form on an order-creation failure, without touching the cart", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([
      () => jsonResponse({ error: "One or more items are no longer available.", status: 409 }, false, 409),
    ]);

    render(<App />);
    await screen.findByText("Checkout");
    fillValidCheckoutForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Payment" }));

    expect(await screen.findByText("One or more items are no longer available.")).toBeInTheDocument();
    // Back on the real form, not the status panel - the payment button reappears.
    expect(screen.getByRole("button", { name: "Continue to Payment" })).toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(1);
  });

  it("shows a manual-retry failure panel when the widget's own payment.failed event fires, and reuses the same order on retry", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([
      () => jsonResponse(SAMPLE_ORDER),
      () => jsonResponse(SAMPLE_INITIATE),
      // Retry re-initiates against the SAME order id - no second POST /orders call.
      (url) => {
        expect(url).toBe(PAYMENTS_URL);
        return jsonResponse(SAMPLE_INITIATE);
      },
    ]);

    render(<App />);
    await screen.findByText("Checkout");
    fillValidCheckoutForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Payment" }));

    await waitFor(() => expect(MockRazorpay.lastInstance?.openCalls).toBe(1));
    MockRazorpay.lastInstance?.failureHandler?.({
      error: { code: "BAD_REQUEST_ERROR", description: "Card was declined." },
    });

    expect(await screen.findByText("Payment failed")).toBeInTheDocument();
    expect(screen.getByText("Card was declined.")).toBeInTheDocument();
    // Cart was never cleared - payment never actually succeeded.
    expect(useCartStore.getState().items).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry Payment" }));
    await waitFor(() => expect(MockRazorpay.lastInstance?.openCalls).toBe(1)); // fresh instance, opened once
    expect(fetch).toHaveBeenCalledTimes(3); // orders, initiate, retry-initiate - never a second orders call
  });

  it("shows a cancelled panel, not an error, when the guest closes the widget without paying", async () => {
    useCartStore.setState({
      items: [{ productId: 42, name: "Handwoven Cotton Saree", price: 1499, quantity: 1, vendorId: 7, imageUrl: null }],
    });
    window.history.pushState({}, "", "/checkout");
    mockFetchSequence([() => jsonResponse(SAMPLE_ORDER), () => jsonResponse(SAMPLE_INITIATE)]);

    render(<App />);
    await screen.findByText("Checkout");
    fillValidCheckoutForm();
    fireEvent.click(screen.getByRole("button", { name: "Continue to Payment" }));

    await waitFor(() => expect(MockRazorpay.lastInstance?.openCalls).toBe(1));
    MockRazorpay.lastInstance?.options.modal.ondismiss();

    expect(await screen.findByText("Payment wasn't completed")).toBeInTheDocument();
    expect(useCartStore.getState().items).toHaveLength(1);
  });
});
