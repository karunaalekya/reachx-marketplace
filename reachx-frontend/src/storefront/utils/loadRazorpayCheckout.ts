const RAZORPAY_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

let loadPromise: Promise<void> | null = null;

// Razorpay's web checkout ships as a plain <script> tag, not an npm package - this loads it once,
// lazily (only when a guest actually reaches payment, not on every storefront page load), and is
// safe to call repeatedly: it returns the same in-flight/resolved promise rather than injecting
// the script a second time. On failure it clears the cached promise so a later, manual retry
// (per the plan's "never auto-retry" rule - this is a load failure, not a payment failure, but
// the same manual-retry discipline applies) gets a real second attempt instead of a permanently
// rejected promise.
export function loadRazorpayCheckout(): Promise<void> {
  if (typeof window !== "undefined" && window.Razorpay) {
    return Promise.resolve();
  }
  if (loadPromise) {
    return loadPromise;
  }

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${RAZORPAY_SCRIPT_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => {
        loadPromise = null;
        reject(new Error("Couldn't load the payment widget. Check your connection and try again."));
      });
      return;
    }

    const script = document.createElement("script");
    script.src = RAZORPAY_SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loadPromise = null;
      reject(new Error("Couldn't load the payment widget. Check your connection and try again."));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}
