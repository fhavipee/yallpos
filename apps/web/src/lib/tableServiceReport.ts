import { api } from "./api";

export async function downloadTableServiceTimesCsv(date?: string) {
  const res = await api.get("/v1/reports/table-service-times/export", {
    params: { format: "csv", ...(date ? { date } : {}) },
    responseType: "blob",
  });
  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tiempos-mesa-${date ?? new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function printTableServiceTimesReport(date?: string) {
  const res = await api.get("/v1/reports/table-service-times/export", {
    params: { format: "html", ...(date ? { date } : {}) },
    responseType: "text",
  });
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Permite ventanas emergentes para imprimir el reporte");
    return;
  }
  popup.document.open();
  popup.document.write(res.data);
  popup.document.close();
}

export function getWeekStartMonday(reference = new Date()): string {
  const day = new Date(reference);
  day.setHours(0, 0, 0, 0);
  const weekday = day.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  day.setDate(day.getDate() + diff);
  return day.toISOString().slice(0, 10);
}

export async function downloadTableServiceTimesWeeklyCsv(weekStart?: string) {
  const res = await api.get("/v1/reports/table-service-times/weekly/export", {
    params: { format: "csv", ...(weekStart ? { weekStart } : {}) },
    responseType: "blob",
  });
  const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `tiempos-mesa-semana-${weekStart ?? getWeekStartMonday()}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function printTableServiceTimesWeeklyReport(weekStart?: string) {
  const res = await api.get("/v1/reports/table-service-times/weekly/export", {
    params: { format: "html", ...(weekStart ? { weekStart } : {}) },
    responseType: "text",
  });
  const popup = window.open("", "_blank");
  if (!popup) {
    alert("Permite ventanas emergentes para imprimir el reporte");
    return;
  }
  popup.document.open();
  popup.document.write(res.data);
  popup.document.close();
}

export type OverdueTableRow = {
  invoiceId: string;
  tableLabel: string;
  waiterName?: string;
  waitingMinutes: number;
  isOverdue?: boolean;
};

export function findOverdueTables(
  rows: OverdueTableRow[],
  warnAfterMinutes: number,
): OverdueTableRow[] {
  return rows.filter(
    (row) => row.isOverdue ?? row.waitingMinutes >= warnAfterMinutes,
  );
}

export function notifyOverdueTables(
  rows: OverdueTableRow[],
  warnedIds: Set<string>,
  options: {
    warnAfterMinutes: number;
    soundEnabled?: boolean;
    onAlert?: (overdue: OverdueTableRow[]) => void;
  },
) {
  const overdue = findOverdueTables(rows, options.warnAfterMinutes);
  const fresh = overdue.filter((row) => !warnedIds.has(row.invoiceId));
  if (fresh.length === 0) return overdue;

  for (const row of fresh) warnedIds.add(row.invoiceId);
  options.onAlert?.(fresh);

  if (options.soundEnabled !== false) playOverdueTone();

  if (typeof Notification !== "undefined" && Notification.permission === "granted") {
    const first = fresh[0];
    new Notification("Mesa esperando demasiado", {
      body: `${first.tableLabel} · ${first.waitingMinutes} min sin servir${fresh.length > 1 ? ` (+${fresh.length - 1})` : ""}`,
    });
  }

  return overdue;
}

export function playOverdueTone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    for (const [index, freq] of [440, 440, 660, 880].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.2 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.2 + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.2);
      osc.stop(now + index * 0.2 + 0.1);
    }
    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // ignorar
  }
}
