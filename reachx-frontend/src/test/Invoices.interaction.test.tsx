import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { useAuthStore } from "../auth/store/useAuthStore";

// Same posture as Products.interaction.test.tsx/OrdersDisputes.interaction.test.tsx: NOT a
// live-backend test - mounts the real component tree in jsdom, drives a real nav click through
// the real router/store/API wrapper, mocks only the fetch() boundary. Covers the vendor-facing
// Invoices module this session actually built (GET /invoices/mine, GET
// /invoices/mine/{id}/download) - closes the gap navConfig.ts flagged ("InvoiceController is
// live and untouched by any frontend UI yet").

const INVOICES_MINE_PREFIX = "http://localhost:8080/api/v1/invoices/mine";

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

// downloadMyInvoice() reads the response as a blob, not JSON - jsdom's Response/Blob stand-ins
// don't need real PDF bytes for this, only something .blob() can resolve.
function blobResponse(ok = true, status = ok ? 200 : 400): Response {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Not Found",
    blob: async () => new Blob(["%PDF-fake"], { type: "application/pdf" }),
    json: async () => ({ message: "Not Found" }),
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
    size: 25,
    first: true,
    last: true,
    empty: true,
  };
}

const SAMPLE_INVOICE = {
  id: 501,
  invoiceNumber: "RX-2026-INV-000501",
  orderId: 501,
  vendorId: 1,
  taxType: "CGST_SGST",
  taxRatePercent: 12,
  taxableValue: 1499,
  shippingFeeAmount: 49,
  cgstAmount: 89.94,
  sgstAmount: 89.94,
  igstAmount: 0,
  totalAmount: 1727.88,
  pdfUrl: "https://fake-bucket.example.com/invoices/RX-2026-INV-000501.pdf",
  generatedAt: "2026-08-15T10:30:00Z",
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // "/" now belongs to the real storefront (StorefrontShell) - navigate to the real vendor
  // entry point. Same reasoning as the other vendor test files.
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

describe("VendorInvoicesPanel - real nav, real store, mocked fetch boundary", () => {
  it("loads the Invoices tab and renders a real invoice row", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]), // ActionCenterCard's KYC fetch on Home
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      (url) => {
        expect(url.startsWith(INVOICES_MINE_PREFIX)).toBe(true);
        return jsonResponse({
          ...emptyPage(),
          content: [SAMPLE_INVOICE],
          totalElements: 1,
          totalPages: 1,
          empty: false,
        });
      },
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Invoices" }));

    expect(await screen.findByText("RX-2026-INV-000501")).toBeInTheDocument();
    expect(screen.getByText("#501")).toBeInTheDocument();
    expect(screen.getByText("CGST + SGST")).toBeInTheDocument();
    expect(screen.getByText(/₹1,727\.88/)).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows the real empty state when a vendor has no invoices yet", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse(emptyPage()),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Invoices" }));

    expect(
      await screen.findByText("No invoices yet — they appear here once an order ships.")
    ).toBeInTheDocument();
  });

  it("surfaces a real fetch error in the banner without crashing the tab bar", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () => jsonResponse({ message: "Invoice service unavailable" }, false, 503),
    ]);

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Invoices" }));

    expect(await screen.findByText("Invoice service unavailable")).toBeInTheDocument();
    // Nav bar survived the error - still on the real dashboard shell, not a crashed tree.
    expect(screen.getByRole("link", { name: "Invoices" })).toBeInTheDocument();
  });

  it("downloads an invoice's real PDF via the authenticated blob path, not a bare link", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]),
      () =>
        jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
      () =>
        jsonResponse({
          ...emptyPage(),
          content: [SAMPLE_INVOICE],
          totalElements: 1,
          totalPages: 1,
          empty: false,
        }),
      (url) => {
        expect(url).toBe(`${INVOICES_MINE_PREFIX}/501/download`);
        return blobResponse();
      },
    ]);

    // jsdom doesn't implement createObjectURL/revokeObjectURL - stub only those two methods on
    // the real global URL (not the whole global, which would break react-router's own `new
    // URL(...)` calls elsewhere in the tree).
    const createObjectURL = vi.fn(() => "blob:fake-url");
    const revokeObjectURL = vi.fn();
    URL.createObjectURL = createObjectURL;
    URL.revokeObjectURL = revokeObjectURL;

    await loginAndReachHome();
    fireEvent.click(screen.getByRole("link", { name: "Invoices" }));
    await screen.findByText("RX-2026-INV-000501");

    fireEvent.click(screen.getByRole("button", { name: "Download invoice RX-2026-INV-000501" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake-url");
    // Not asserting consoleErrorSpy here like the other tests in this file - jsdom itself logs
    // a benign "not implemented: navigation" error when it tries to actually follow the
    // temporary anchor's blob: href (real browsers just download the file; jsdom has no
    // download/navigation implementation for blob URLs at all). That's a jsdom limitation
    // triggered by this exact test technique, not something the app did wrong - the two
    // assertions above are what actually prove the real download path ran correctly.
  });
});
