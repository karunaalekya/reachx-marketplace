import { create } from "zustand";
import { Invoice, listMyInvoices, downloadMyInvoice } from "../api/invoicesApi";

// No persist middleware - same "don't cache business data" reasoning as useProductsStore/
// useOrdersStore. Invoices are immutable once generated, but the list itself grows over time
// and should always reflect what's actually on the server on mount, not a stale local copy.

interface InvoicesState {
  invoices: Invoice[];
  page: number;
  totalPages: number;
  isLoading: boolean;
  error: string | null;

  // Tracks which invoice id is mid-download so the panel can disable just that row's button
  // (not the whole list) and show a spinner - same per-item-busy pattern as
  // useProductsStore's imagesLoading.
  downloadingId: number | null;
  downloadError: string | null;

  fetchInvoices: (token: string, page?: number) => Promise<void>;
  downloadInvoice: (token: string, invoice: Invoice) => Promise<void>;
}

export const useInvoicesStore = create<InvoicesState>()((set, get) => ({
  invoices: [],
  page: 0,
  totalPages: 0,
  isLoading: false,
  error: null,

  downloadingId: null,
  downloadError: null,

  fetchInvoices: async (token, page) => {
    const targetPage = page ?? get().page;
    set({ isLoading: true, error: null });
    try {
      const result = await listMyInvoices(token, targetPage);
      set({
        invoices: result.content,
        page: result.number,
        totalPages: result.totalPages,
        isLoading: false,
      });
    } catch (err) {
      set({
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to load invoices.",
      });
    }
  },

  downloadInvoice: async (token, invoice) => {
    set({ downloadingId: invoice.id, downloadError: null });
    try {
      await downloadMyInvoice(invoice.id, token, `${invoice.invoiceNumber}.pdf`);
      set({ downloadingId: null });
    } catch (err) {
      set({
        downloadingId: null,
        downloadError: err instanceof Error ? err.message : "Failed to download invoice.",
      });
    }
  },
}));
