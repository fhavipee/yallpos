import type { TableReadyDetail } from "./kdsSocket";
import type { WaiterIdentity } from "./pin";

export function resolveWaiterIdentity(
  activeWaiter: WaiterIdentity | null | undefined,
  user?: { id: string; name: string; role?: string } | null,
): WaiterIdentity | null {
  if (activeWaiter) return activeWaiter;
  if (user?.role === "waiter") {
    return { kind: "user", id: user.id, name: user.name, role: user.role };
  }
  return null;
}

export function matchesOrderWaiter(
  detail: Pick<TableReadyDetail, "waiterId" | "waiterUserId">,
  identity: WaiterIdentity | null | undefined,
): boolean {
  if (!identity) return true;
  if (!detail.waiterId && !detail.waiterUserId) return true;
  if (identity.kind === "staff") return detail.waiterId === identity.id;
  return detail.waiterUserId === identity.id;
}

export function orderReadyActionLabel(detail: TableReadyDetail): string {
  if (detail.actionHint === "pickup") return "Retirar en cocina";
  if (detail.serviceType === "takeaway" || detail.serviceType === "counter") return "Retirar en cocina";
  return "Servir mesa";
}

export function playKitchenReadyTone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const t = ctx.currentTime;
    for (const [i, freq] of [523, 659, 784].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.2, t + i * 0.12 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t + i * 0.12);
      osc.stop(t + i * 0.12 + 0.2);
    }
    window.setTimeout(() => void ctx.close(), 800);
  } catch {
    // ignore
  }
}

export function notifyKitchenReadyBrowser(detail: TableReadyDetail) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const label = detail.orderLabel ?? detail.tableLabel ?? "Pedido";
  new Notification("Pedido listo en cocina", {
    body: `${label}${detail.itemsSummary ? ` · ${detail.itemsSummary}` : ""}`,
  });
}

export function queueRowToReadyDetail(row: {
  invoiceId: string;
  tableSessionId?: string | null;
  tableId?: string | null;
  tableLabel?: string;
  itemsSummary?: string;
  waiterId?: string | null;
  waiterUserId?: string | null;
  waiterWhatsAppLink?: string | null;
  serviceType?: string;
}): TableReadyDetail {
  return {
    invoiceId: row.invoiceId,
    tableSessionId: row.tableSessionId ?? undefined,
    tableId: row.tableId,
    tableLabel: row.tableLabel,
    orderLabel: row.tableLabel,
    itemsSummary: row.itemsSummary,
    waiterId: row.waiterId,
    waiterUserId: row.waiterUserId,
    waiterWhatsAppLink: row.waiterWhatsAppLink,
    serviceType: row.serviceType,
    actionHint: row.serviceType === "dine_in" ? "serve" : "pickup",
  };
}
