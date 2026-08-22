import { ChevronLeft, ChevronRight } from "lucide-react";

// Wired to the real Page<T> envelope confirmed in vendor/api/payoutApi.ts (Spring's default
// Page<T> JSON shape: content/totalElements/totalPages/number/size/first/last/empty) - the
// pagination-envelope open question carried in the Track B/C session plan is resolved by that
// file, so this component is built against the real shape from the start, not a placeholder
// guess.
//
// One reusable component for every paginated admin table (KYC queue, disputes, payouts, tax,
// invoices) rather than one per screen, per the session plan's production-UX baseline.

interface PaginationProps {
  page: number; // 0-indexed current page
  totalPages: number;
  first: boolean;
  last: boolean;
  onPageChange: (page: number) => void;
  disabled?: boolean;
}

export function Pagination({ page, totalPages, first, last, onPageChange, disabled }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between border-t border-brand-indigo/10 px-4 py-3"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={first || disabled}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-brand-indigo/70
          hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo
          disabled:opacity-30 disabled:hover:bg-transparent transition"
      >
        <ChevronLeft size={16} aria-hidden="true" />
        Previous
      </button>
      <span className="text-xs tabular-nums text-brand-indigo/50" aria-live="polite">
        Page {page + 1} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={last || disabled}
        className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm font-medium text-brand-indigo/70
          hover:bg-brand-indigo/5 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-brand-indigo
          disabled:opacity-30 disabled:hover:bg-transparent transition"
      >
        Next
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </nav>
  );
}
