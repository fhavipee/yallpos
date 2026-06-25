import { io } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? "http://localhost:3000" : window.location.origin);

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
  itemsSummary?: string;
  waiterId?: string | null;
  waiterWhatsAppLink?: string | null;
};

export type TableServedDetail = {
  invoiceId?: string;
  tableSessionId?: string;
  tableId?: string | null;
  tableLabel?: string;
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

export function dispatchTableUpdated(detail?: TableUpdatedDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_UPDATED_EVENT, { detail }));
}

export function dispatchTableReady(detail?: TableReadyDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_READY_EVENT, { detail }));
}

export function dispatchTableServed(detail?: TableServedDetail) {
  window.dispatchEvent(new CustomEvent(TABLE_SERVED_EVENT, { detail }));
}
