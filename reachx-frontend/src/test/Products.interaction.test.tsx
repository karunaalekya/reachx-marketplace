import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { useAuthStore } from "../auth/store/useAuthStore";

// Same posture as OrdersDisputes.interaction.test.tsx: NOT a live-backend test - mounts the real
// component tree in jsdom, drives real nav clicks/form input through the real router/stores/API
// wrappers, mocks only the fetch() boundary. Closes the last gap FRONTEND_STATE.md's Session 6
// section left open ("no test coverage added for VendorPayoutLedger.tsx - only Orders/Disputes
// were in scope") is unrelated to this file's scope - this one covers the brand-new Catalogue/
// Products module this session actually built. Does not touch the still-open end-to-end-against-
// a-real-backend gap (PROJECT_STATE.md, 2026-08-21) - no Docker/Maven Central access here either.

const PRODUCTS_MINE_PREFIX = "http://localhost:8080/api/v1/products/mine";
const PRODUCTS_URL = "http://localhost:8080/api/v1/products";

function mockFetchSequence(handlers: Array<(url: string, init?: RequestInit) => Response>) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const handler = handlers[call];
      call += 1;
      if (!handler) {
        throw new Error(`Unexpected extra fetch call to ${url} (call #${call})`);
      }
      return handler(url, init);
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

const SAMPLE_PRODUCT = {
  id: 42,
  vendorId: 1,
  categoryId: null,
  name: "Cotton Kurta",
  description: "Handloom cotton kurta",
  price: 799,
  stockQuantity: 3,
  sku: "KURTA-001",
  status: "DRAFT",
  createdAt: new Date().toISOString(),
  imageUrls: [],
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // "/" now belongs to the real storefront (StorefrontShell) - navigate to the real vendor
  // entry point so the login form these tests drive is actually what mounts. See the matching
  // comment in App.interaction.test.tsx.
  window.history.pushState({}, "", "/login");
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
  useAuthStore.getState().logout();
});

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

describe("ProductsPanel - real nav, real store, mocked fetch boundary", () => {
  it("mount fetch renders a real product row with price, stock, and status", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]), // ActionCenterCard's KYC fetch on Home
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      (url) => {
        expect(url.startsWith(PRODUCTS_MINE_PREFIX)).toBe(true);
        return jsonResponse({ ...emptyPage(), content: [SAMPLE_PRODUCT], totalElements: 1, totalPages: 1, empty: false });
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Catalogue" }));

    expect(await screen.findByText("Cotton Kurta")).toBeInTheDocument();
    expect(screen.getByText("SKU KURTA-001")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
    expect(screen.getByText("3 in stock")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("creating a product posts the real request shape and prepends the new row", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse(emptyPage()), // initial products/mine fetch, empty catalogue
      (url, init) => {
        expect(url).toBe(PRODUCTS_URL);
        expect(init?.method).toBe("POST");
        const body = JSON.parse(init?.body as string);
        expect(body).toEqual({
          name: "New Saree",
          description: "",
          categoryId: null,
          price: 1299,
          stockQuantity: 10,
          sku: "SAREE-9",
        });
        return jsonResponse({ ...SAMPLE_PRODUCT, id: 99, name: "New Saree", sku: "SAREE-9", price: 1299, stockQuantity: 10 });
      },
      () => jsonResponse([]), // ProductDetail's image fetch when the new row auto-expands
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Catalogue" }));
    await screen.findByText("Nothing here yet - create your first product above.");

    fireEvent.click(screen.getByRole("button", { name: /new product/i }));

    // Field wraps a plain <label>, not an association by htmlFor/id, so labels aren't reliable
    // accessible names here - query by role/order instead, matching how ProductForm actually
    // lays out its inputs (name, sku, categoryId, price, stockQuantity, description).
    const [nameInput, skuInput] = screen.getAllByRole("textbox");
    fireEvent.change(nameInput, { target: { value: "New Saree" } });
    fireEvent.change(skuInput, { target: { value: "SAREE-9" } });
    const numberInputs = screen.getAllByRole("spinbutton");
    // categoryId, price, stockQuantity in that order per ProductForm's field layout.
    fireEvent.change(numberInputs[1], { target: { value: "1299" } });
    fireEvent.change(numberInputs[2], { target: { value: "10" } });

    fireEvent.click(screen.getByRole("button", { name: /create draft/i }));

    expect(await screen.findByText("New Saree")).toBeInTheDocument();
    expect(screen.getByText("SKU SAREE-9")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("disables Publish at zero stock and enables it once stock is positive", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () =>
        jsonResponse({
          ...emptyPage(),
          content: [
            { ...SAMPLE_PRODUCT, id: 1, name: "Zero Stock Item", stockQuantity: 0 },
            { ...SAMPLE_PRODUCT, id: 2, name: "In Stock Item", stockQuantity: 5 },
          ],
          totalElements: 2,
          totalPages: 1,
          empty: false,
        }),
      () => jsonResponse([]), // image fetch for whichever row gets expanded first
      () => jsonResponse([]), // image fetch for the second expanded row
      (url, init) => {
        // Publishing the in-stock product.
        expect(url).toBe("http://localhost:8080/api/v1/products/2/publish");
        expect(init?.method).toBe("POST");
        return { ok: true, status: 204, statusText: "No Content", json: async () => ({}) } as Response;
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Catalogue" }));

    await screen.findByText("Zero Stock Item");
    fireEvent.click(screen.getByText("Zero Stock Item"));
    const zeroStockPublish = await screen.findByRole("button", { name: "Publish" });
    expect(zeroStockPublish).toBeDisabled();
    fireEvent.click(screen.getByText("Zero Stock Item")); // collapse

    fireEvent.click(screen.getByText("In Stock Item"));
    const publishButtons = await screen.findAllByRole("button", { name: "Publish" });
    const inStockPublish = publishButtons.find((b) => !(b as HTMLButtonElement).disabled);
    expect(inStockPublish).toBeDefined();
    fireEvent.click(inStockPublish as HTMLElement);

    await waitFor(() => expect(screen.getByText("Live")).toBeInTheDocument());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
