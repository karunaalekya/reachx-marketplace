import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Users } from "lucide-react";

// No `GET /vendors` list-all/browse endpoint is confirmed anywhere in this project's source
// reading (only `/vendors/{id}`, `/vendors/pending-kyc`, and the KYC/dispute queues, none of
// which are a general vendor directory) - inventing a browsable table here would repeat the
// exact mistake this project has corrected twice already (gstEngine.ts, the Radix dependency).
// Instead: a direct by-id lookup, same as an admin support tool that already knows which vendor
// it's looking at from a support ticket, a dispute (`Vendor #{id}`), or the KYC queue. Cross-link
// from those screens is the natural "browse" path until a real list endpoint gets confirmed.
export function AdminVendorLookupPanel() {
  const [input, setInput] = useState("");
  const navigate = useNavigate();

  const parsedId = Number(input.trim());
  const isValid = input.trim() !== "" && Number.isInteger(parsedId) && parsedId > 0;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!isValid) return;
    navigate(`/admin/vendors/${parsedId}`);
  }

  return (
    <div className="mx-auto max-w-md rounded-lg bg-white p-8 text-center shadow-premium-card">
      <Users size={28} className="mx-auto text-brand-indigo/30" aria-hidden="true" />
      <h2 className="mt-3 font-display text-lg text-brand-indigo">Look up a vendor</h2>
      <p className="mt-1 text-sm opacity-60">
        Enter a vendor ID to view their profile, account health, commission rate, and invoices.
        You can also reach a vendor directly from the KYC queue or a dispute.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 flex items-center justify-center gap-2">
        <label className="sr-only" htmlFor="vendor-id-lookup">
          Vendor ID
        </label>
        <input
          id="vendor-id-lookup"
          type="number"
          min={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Vendor ID"
          className="w-40 rounded-md border border-brand-indigo/20 px-3 py-2 text-sm outline-none
            focus:ring-2 focus:ring-brand-indigo"
        />
        <button
          type="submit"
          disabled={!isValid}
          className="flex min-h-11 items-center gap-2 rounded-md bg-brand-saffron px-4 py-2 text-sm font-medium
            text-white hover:brightness-110 focus-visible:ring-2 focus-visible:ring-offset-2
            focus-visible:ring-brand-indigo disabled:opacity-40 transition"
        >
          <Search size={16} aria-hidden="true" />
          View
        </button>
      </form>
    </div>
  );
}
