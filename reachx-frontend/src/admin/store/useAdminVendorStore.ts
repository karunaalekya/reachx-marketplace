import { create } from "zustand";
import { getVendor, type VendorSummary } from "../api/adminKycApi";
import {
  getVendorAccountHealth,
  updateCommissionRate,
  suspendVendor,
  reactivateVendor,
  type AccountHealth,
} from "../api/adminVendorsApi";
import { listVendorInvoices, downloadInvoice, type InvoiceSummary, type Page } from "../api/adminInvoicesApi";

// Per-domain zustand store, mirrors useAdminKycStore.ts / useAdminDisputesStore.ts's pattern - a
// third, separate store rather than folding vendor management into either of the existing two,
// same reasoning both of those files already give for not sharing one global admin store.
//
// There is no `GET /vendors` list-all endpoint confirmed anywhere in this project's source
// reading (only `/vendors/{id}`, `/vendors/pending-kyc`, and the dispute/KYC queues, none of
// which are a general vendor directory) - this store is deliberately built around "load one
// vendor by id", not a browsable list, so nothing here guesses at an endpoint nobody confirmed.
// The admin reaches a vendor either by typing an id directly (AdminVendorLookupPanel) or via a
// cross-link from a screen that already has one (KYC queue, dispute detail).

interface AdminVendorState {
  vendorId: number | null;
  vendor: VendorSummary | null;
  vendorLoading: boolean;
  vendorError: string | null;

  health: AccountHealth | null;
  healthLoading: boolean;
  healthError: string | null;

  invoices: Page<InvoiceSummary> | null;
  invoicesLoading: boolean;
  invoicesError: string | null;

  updatingCommission: boolean;
  commissionError: string | null;

  updatingStatus: boolean;
  statusError: string | null;

  downloadingInvoiceId: number | null;
  downloadError: string | null;

  loadVendor: (vendorId: number, token: string) => Promise<void>;
  fetchInvoices: (page: number, token: string) => Promise<void>;
  setCommissionRate: (rate: number, token: string) => Promise<void>;
  suspend: (reason: string, token: string) => Promise<void>;
  reactivate: (token: string) => Promise<void>;
  downloadInvoiceById: (invoiceId: number, invoiceNumber: string, token: string) => Promise<void>;
  clear: () => void;
}

const INITIAL_STATE = {
  vendorId: null,
  vendor: null,
  vendorLoading: false,
  vendorError: null,

  health: null,
  healthLoading: false,
  healthError: null,

  invoices: null,
  invoicesLoading: false,
  invoicesError: null,

  updatingCommission: false,
  commissionError: null,

  updatingStatus: false,
  statusError: null,

  downloadingInvoiceId: null,
  downloadError: null,
} as const;

export const useAdminVendorStore = create<AdminVendorState>()((set, get) => ({
  ...INITIAL_STATE,

  loadVendor: async (vendorId, token) => {
    set({
      ...INITIAL_STATE,
      vendorId,
      vendorLoading: true,
      healthLoading: true,
      invoicesLoading: true,
    });

    // Three independent fetches, each with its own loading/error slice - a slow or failing
    // account-health call shouldn't block the vendor header or the invoice list from rendering,
    // and vice versa. No Promise.all bundling them into one shared error state.
    getVendor(vendorId, token)
      .then((vendor) => set({ vendor, vendorLoading: false }))
      .catch((err) =>
        set({
          vendorLoading: false,
          vendorError: err instanceof Error ? err.message : "Failed to load vendor.",
        })
      );

    getVendorAccountHealth(vendorId, token)
      .then((health) => set({ health, healthLoading: false }))
      .catch((err) =>
        set({
          healthLoading: false,
          healthError: err instanceof Error ? err.message : "Failed to load account health.",
        })
      );

    listVendorInvoices(vendorId, token, 0)
      .then((invoices) => set({ invoices, invoicesLoading: false }))
      .catch((err) =>
        set({
          invoicesLoading: false,
          invoicesError: err instanceof Error ? err.message : "Failed to load invoices.",
        })
      );
  },

  fetchInvoices: async (page, token) => {
    const { vendorId } = get();
    if (vendorId === null) return;
    set({ invoicesLoading: true, invoicesError: null });
    try {
      const invoices = await listVendorInvoices(vendorId, token, page);
      set({ invoices, invoicesLoading: false });
    } catch (err) {
      set({
        invoicesLoading: false,
        invoicesError: err instanceof Error ? err.message : "Failed to load invoices.",
      });
    }
  },

  setCommissionRate: async (rate, token) => {
    const { vendorId, updatingCommission } = get();
    if (vendorId === null || updatingCommission) return;
    set({ updatingCommission: true, commissionError: null });
    try {
      // No optimistic UI - wait for the real backend response, per the production-UX baseline
      // every mutation in this project follows.
      const vendor = await updateCommissionRate(vendorId, { commissionRate: rate }, token);
      set({ vendor, updatingCommission: false });
    } catch (err) {
      set({
        updatingCommission: false,
        commissionError: err instanceof Error ? err.message : "Failed to update commission rate.",
      });
      throw err;
    }
  },

  suspend: async (reason, token) => {
    const { vendorId, updatingStatus } = get();
    if (vendorId === null || updatingStatus) return;
    set({ updatingStatus: true, statusError: null });
    try {
      const vendor = await suspendVendor(vendorId, { reason }, token);
      set({ vendor, updatingStatus: false });
    } catch (err) {
      set({
        updatingStatus: false,
        statusError: err instanceof Error ? err.message : "Failed to suspend vendor.",
      });
      throw err;
    }
  },

  reactivate: async (token) => {
    const { vendorId, updatingStatus } = get();
    if (vendorId === null || updatingStatus) return;
    set({ updatingStatus: true, statusError: null });
    try {
      const vendor = await reactivateVendor(vendorId, token);
      set({ vendor, updatingStatus: false });
    } catch (err) {
      set({
        updatingStatus: false,
        statusError: err instanceof Error ? err.message : "Failed to reactivate vendor.",
      });
      throw err;
    }
  },

  downloadInvoiceById: async (invoiceId, invoiceNumber, token) => {
    if (get().downloadingInvoiceId !== null) return;
    set({ downloadingInvoiceId: invoiceId, downloadError: null });
    try {
      await downloadInvoice(invoiceId, token, `${invoiceNumber || `invoice-${invoiceId}`}.pdf`);
      set({ downloadingInvoiceId: null });
    } catch (err) {
      set({
        downloadingInvoiceId: null,
        downloadError: err instanceof Error ? err.message : "Failed to download invoice.",
      });
    }
  },

  clear: () => set({ ...INITIAL_STATE }),
}));
