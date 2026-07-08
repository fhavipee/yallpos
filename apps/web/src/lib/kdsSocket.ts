import { io } from "socket.io-client";
import { getApiBaseUrl } from "./api";

const API_URL = getApiBaseUrl();

export type TableUpdatedDetail = {
  tableId?: string;
  tableSessionId?: string;
  status?: "opened" | "updated" | "closed";
  openInvoices?: number;
};

export type TableReadyDetail = {
  invoiceId?: string;
  tableSessionId?: string;
  tableId?: string | null;
  tableLabel?: string;
  orderLabel?: string;
  itemsSummary?: string;
  serviceType?: string;
  waiterId?: string | null;
  waiterUserId?: string | null;
  waiterName?: string | null;
  waiterWhatsAppLink?: string | null;
  actionHint?: "serve" | "pickup";
};

export type TableServedDetail = {
  invoiceId?: string;
  tableSessionId?: string;
  tableId?: string | null;
  tableLabel?: string;
};

export type LineVoidedDetail = {
  invoiceId: string;
  lineId: string;
  tableSessionId?: string | null;
  tableId?: string | null;
  serviceType?: string;
  label?: string;
  productName?: string;
  qty?: number;
  actor?: "waiter" | "kitchen";
};

export type InvoiceUpdatedDetail = {
  invoiceId: string;
  tableSessionId?: string | null;
  tableId?: string | null;
  serviceType?: string;
  changeType: "line-discount" | "invoice-discount" | "line-removed";
  lineId?: string;
  productName?: string;
};

export function createBranchSocket(branchId: string, stationId?: string) {
  return io(`${API_URL}/kds`, {
    query: { branchId, ...(stationId ? { stationId } : {}) },
  });
}

export function createKdsSocket(branchId: string, stationId?: string) {
  return createBranchSocket(branchId, stationId);
}

export const TABLE_UPDATED_EVENT = "yallpos:table-updated";
export const TABLE_READY_EVENT = "yallpos:table-ready";
export const TABLE_SERVED_EVENT = "yallpos:table-served";
export const LINE_VOIDED_EVENT = "yallpos:line-voided";
export const INVOICE_UPDATED_EVENT = "yallpos:invoice-updated";

export function dispatchTableUpdated(detail?: TableUpdatedDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_UPDATED_EVENT, { detail }));
}

export function dispatchTableReady(detail?: TableReadyDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_READY_EVENT, { detail }));
}

export function dispatchTableServed(detail?: TableServedDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_SERVED_EVENT, { detail }));
}

export function dispatchLineVoided(detail: LineVoidedDetail) {
  window.dispatchEvent(new CustomEvent(LINE_VOIDED_EVENT, { detail }));
}

export function dispatchInvoiceUpdated(detail: InvoiceUpdatedDetail) {
  window.dispatchEvent(new CustomEvent(INVOICE_UPDATED_EVENT, { detail }));
}
