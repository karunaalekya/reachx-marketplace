import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "../App";
import { useAuthStore } from "../auth/store/useAuthStore";

// This is NOT a live-backend test - no real Spring Boot server was reachable from this sandbox
// (same Maven Central limitation documented in PRESENT_POSITION_AND_DESIGN_DECISIONS.md means
// the backend has never been compiled or run here either). What this DOES do, for real: mount
// the actual component tree in a browser-like DOM (jsdom), drive real DOM interactions
// (login form submit, file-input change) through the real stores and the real API wrapper
// fetch calls, and assert on what actually renders. The network layer is mocked at the
// fetch() boundary - everything above that boundary (components, stores, API wrappers, toast
// wiring) is real and actually executes.
//
// Session 2 update: App now gates on useAuthStore's token instead of rendering
// KycVerificationPanel directly with placeholder props. The first describe block below is new
// - it exercises the real login form. The KYC upload tests that follow are the same real
// interaction tests from Session 1, updated to first drive a real login (auth token is no
// longer a hardcoded placeholder prop) before reaching the KYC panel, since that panel is now
// nested behind the auth gate and the dashboard shell's nav instead of being the page root.

const LOGIN_URL = "http://localhost:8080/api/v1/auth/login";
const PRESIGN_URL = "http://localhost:8080/api/v1/vendors/1/kyc-documents/presign";
const CONFIRM_URL = "http://localhost:8080/api/v1/vendors/1/kyc-documents";
const UPLOAD_URL = "https://fake-bucket.example.com/presigned-put";

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

async function loginThroughRealForm() {
  render(<App />);
  fireEvent.change(screen.getByPlaceholderText("you@business.com"), {
    target: { value: "vendor@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: "correct-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Any console.error during render/effects is treated as a real failure below - this is what
  // actually catches "React mounted but threw/warned" rather than just "the build compiled".
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  consoleErrorSpy.mockRestore();
  // Reset the real auth store between tests - it's a real module-level singleton, not
  // re-created per render, so a test that logs in must not leak into the next one.
  useAuthStore.getState().logout();
});

describe("Login gate - real form, real store, mocked fetch boundary", () => {
  it("renders the login form when no session exists, and does not call the KYC/account-health endpoints yet", () => {
    render(<App />);
    expect(screen.getByText("Vendor sign in")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows the real 401 error message on a failed login and does not proceed to the shell", async () => {
    mockFetchSequence([
      (url) => {
        expect(url).toBe(LOGIN_URL);
        return jsonResponse(
          { error: "Invalid email or password", timestamp: new Date().toISOString(), status: 401 },
          false,
          401
        );
      },
    ]);

    await loginThroughRealForm();

    expect(await screen.findByText("Invalid email or password")).toBeInTheDocument();
    expect(screen.getByText("Vendor sign in")).toBeInTheDocument();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("logs in successfully and reaches the real dashboard shell", async () => {
    mockFetchSequence([
      () => jsonResponse(LOGIN_SUCCESS_BODY),
      () => jsonResponse([]), // KYC documents fetch, triggered by ActionCenterCard on the Home tab
      () =>
        jsonResponse({
          overallScore: 80,
          rating: "GOOD",
          kycScore: 50,
          fulfilmentScore: 100,
          disputeScore: 100,
        }), // account-health fetch, triggered by ActionCenterCard
    ]);

    await loginThroughRealForm();

    expect(await screen.findByText("Placeholder Vendor")).toBeInTheDocument();
    expect(screen.getByText("Action Center")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Account health: GOOD/)).toBeInTheDocument());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});

async function loginThenGoToKyc(afterLoginHandlers: Array<(url: string) => Response>) {
  mockFetchSequence([
    () => jsonResponse(LOGIN_SUCCESS_BODY),
    () => jsonResponse([]), // ActionCenterCard's KYC fetch on the Home tab
    () =>
      jsonResponse({ overallScore: 80, rating: "GOOD", kycScore: 50, fulfilmentScore: 100, disputeScore: 100 }),
    ...afterLoginHandlers,
  ]);

  const utils = render(<App />);
  fireEvent.change(screen.getByPlaceholderText("you@business.com"), {
    target: { value: "vendor@example.com" },
  });
  fireEvent.change(screen.getByPlaceholderText("••••••••"), {
    target: { value: "correct-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

  await screen.findByText("Action Center");
  // Nav items are real <a> links via react-router's NavLink as of the routing migration
  // (App.tsx/VendorDashboardShell.tsx), not <button>s - role updated to match, not a behavior
  // change: clicking still navigates to /vendor/kyc and mounts KycVerificationPanel the same way.
  fireEvent.click(screen.getByRole("link", { name: "Verification" }));
  await screen.findByText("Verification documents");
  return utils;
}

describe("Real upload interaction, mocked network boundary", () => {
  it("drives presign -> PUT -> confirm and fires a success toast", async () => {
    const { container } = await loginThenGoToKyc([
      () => jsonResponse([]), // KycVerificationPanel's own mount fetch when the KYC tab is opened
      (url) => {
        expect(url).toBe(PRESIGN_URL);
        return jsonResponse({
          uploadUrl: UPLOAD_URL,
          publicUrl: "https://fake-bucket.example.com/pan-card.pdf",
          objectKey: "vendors/1/kyc/pan-card.pdf",
          expiresInSeconds: 900,
        });
      },
      (url) => {
        expect(url).toBe(UPLOAD_URL);
        return jsonResponse({}, true);
      },
      (url) => {
        expect(url).toBe(CONFIRM_URL);
        return jsonResponse({
          id: 101,
          docType: "PAN",
          required: true,
          documentUrl: "https://fake-bucket.example.com/pan-card.pdf",
          status: "PENDING",
          rejectionReason: null,
          uploadedAt: new Date().toISOString(),
          decidedAt: null,
        });
      },
    ]);

    const fileInputs = container.querySelectorAll('input[type="file"]');
    expect(fileInputs.length).toBe(4);
    const panInput = fileInputs[0] as HTMLInputElement;

    const file = new File(["dummy-bytes"], "pan-card.pdf", { type: "application/pdf" });
    fireEvent.change(panInput, { target: { files: [file] } });

    expect(await screen.findByText("PAN card submitted")).toBeInTheDocument();
    expect(screen.getByText("Your document is now under review.")).toBeInTheDocument();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it("shows a failure toast when the presigned PUT to storage fails", async () => {
    const { container } = await loginThenGoToKyc([
      () => jsonResponse([]),
      () =>
        jsonResponse({
          uploadUrl: UPLOAD_URL,
          publicUrl: "https://fake-bucket.example.com/pan-card.pdf",
          objectKey: "vendors/1/kyc/pan-card.pdf",
          expiresInSeconds: 900,
        }),
      () => jsonResponse({}, false, 500), // PUT fails - simulates a dropped storage connection
    ]);

    const fileInputs = container.querySelectorAll('input[type="file"]');
    const panInput = fileInputs[0] as HTMLInputElement;
    const file = new File(["dummy-bytes"], "pan-card.pdf", { type: "application/pdf" });
    fireEvent.change(panInput, { target: { files: [file] } });

    expect(await screen.findByText("PAN card upload failed")).toBeInTheDocument();
    expect(screen.getByText("See the error above for details.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Upload to storage failed - the file never reached the bucket, nothing was confirmed."
      )
    ).toBeInTheDocument();
  });

  it("recovers from a dropped confirm call via manual retry, without re-uploading the file", async () => {
    const { container } = await loginThenGoToKyc([
      () => jsonResponse([]), // KycVerificationPanel's own mount fetch
      (url) => {
        expect(url).toBe(PRESIGN_URL);
        return jsonResponse({
          uploadUrl: UPLOAD_URL,
          publicUrl: "https://fake-bucket.example.com/pan-card.pdf",
          objectKey: "vendors/1/kyc/pan-card.pdf",
          expiresInSeconds: 900,
        });
      },
      (url) => {
        expect(url).toBe(UPLOAD_URL); // PUT to the bucket succeeds - file is safely stored
        return jsonResponse({}, true);
      },
      (url) => {
        expect(url).toBe(CONFIRM_URL); // first confirm call drops
        throw new Error("network error");
      },
    ]);

    const fileInputs = container.querySelectorAll('input[type="file"]');
    const panInput = fileInputs[0] as HTMLInputElement;
    const file = new File(["dummy-bytes"], "pan-card.pdf", { type: "application/pdf" });
    fireEvent.change(panInput, { target: { files: [file] } });

    // Distinct copy from a real upload failure - the file is safe, only confirmation is pending.
    expect(await screen.findByText("PAN card needs one more step")).toBeInTheDocument();
    expect(
      screen.getByText(/Your file reached storage, but we couldn't confirm it with the server/)
    ).toBeInTheDocument();

    const retryButton = screen.getByRole("button", {
      name: "Retry confirmation for PAN card",
    });
    expect(retryButton).toBeInTheDocument();

    // Retry only calls confirm again - no second presign, no second PUT. Only one more handler
    // is queued, so a stray extra fetch call (e.g. an accidental re-upload) would fail the test
    // via the "Unexpected extra fetch call" guard in mockFetchSequence.
    mockFetchSequence([
      (url) => {
        expect(url).toBe(CONFIRM_URL); // retry hits confirm directly with the same objectKey
        return jsonResponse({
          id: 101,
          docType: "PAN",
          required: true,
          documentUrl: "https://fake-bucket.example.com/pan-card.pdf",
          status: "PENDING",
          rejectionReason: null,
          uploadedAt: new Date().toISOString(),
          decidedAt: null,
        });
      },
    ]);

    fireEvent.click(retryButton);

    await waitFor(() =>
      expect(
        screen.queryByText(/Your file reached storage, but we couldn't confirm it/)
      ).not.toBeInTheDocument()
    );
    expect(screen.queryByRole("button", { name: /Retry confirmation/ })).not.toBeInTheDocument();

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
