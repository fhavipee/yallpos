import { useCallback, useEffect, useRef, useState } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
import { TABLE_READY_EVENT, TABLE_SERVED_EVENT } from "../lib/kdsSocket";
import {
  downloadTableServiceTimesCsv,
  notifyOverdueTables,
  printTableServiceTimesReport,
  type OverdueTableRow,
} from "../lib/tableServiceReport";

type PendingTable = {
  invoiceId: string;
  tableSessionId: string;
  tableId?: string | null;
  tableLabel: string;
  itemsSummary?: string;
  total: string | number;
  waiterId?: string | null;
  waiterName: string;
  readyAt: string;
  waitingMinutes: number;
  isOverdue?: boolean;
  hostWhatsAppLink?: string | null;
  waiterWhatsAppLink?: string | null;
};

type WaiterGroup = {
  waiterId: string | null;
  waiterName: string;
  tables: PendingTable[];
};

type ServedRow = {
  invoiceId: string;
  tableSessionId?: string | null;
  tableLabel: string;
  waiterName: string;
  readyAt: string;
  servedAt: string;
  waitMinutes: number;
  itemsSummary?: string;
};

type HostBoardData = {
  pendingCount: number;
  overdueCount?: number;
  warnAfterMinutes?: number;
  avgWaitMinutesToday: number;
  longestPendingMinutes: number;
  servedCountToday: number;
  pendingByWaiter: WaiterGroup[];
  servedToday: ServedRow[];
};

export default function HostBoard({
  branchId,
  active,
  onOpenOrder,
}: {
  branchId: string;
  active?: boolean;
  onOpenOrder: (sessionId: string) => void;
}) {
  const [data, setData] = useState<HostBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [markingServedId, setMarkingServedId] = useState<string | null>(null);
  const [overdueAlert, setOverdueAlert] = useState<OverdueTableRow[]>([]);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const overdueWarnedRef = useRef(new Set<string>());
  const overdueSoundRef = useRef(true);

  const refresh = useCallback(async () => {
    try {
      const [boardRes, settingsRes] = await Promise.all([
        api.get("/v1/pos/host-board"),
        api.get("/v1/settings/branch").catch(() => ({ data: {} })),
      ]);
      const board = boardRes.data as HostBoardData;
      setData(board);
      const n = settingsRes.data?.notifications ?? {};
      overdueSoundRef.current = n.tableReadyOverdueSoundEnabled !== false;
      const warnMinutes = Number(n.tableReadyWarnMinutes) || board.warnAfterMinutes || 10;
      const pendingRows = board.pendingByWaiter.flatMap((group) =>
        group.tables.map((row) => ({
          invoiceId: row.invoiceId,
          tableLabel: row.tableLabel,
          waiterName: group.waiterName,
          waitingMinutes: row.waitingMinutes,
          isOverdue: row.isOverdue,
        })),
      );
      const overdue = notifyOverdueTables(pendingRows, overdueWarnedRef.current, {
        warnAfterMinutes: warnMinutes,
        soundEnabled: overdueSoundRef.current,
      });
      setOverdueAlert(overdue ?? []);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setBranchId(branchId);
    refresh();
  }, [branchId, refresh]);

  useEffect(() => {
    if (active) refresh();
  }, [active, refresh]);

  useEffect(() => {
    const onEvent = () => refresh();
    const onServed = (event: Event) => {
      const detail = (event as CustomEvent<{ invoiceId?: string }>).detail;
      if (detail?.invoiceId) overdueWarnedRef.current.delete(detail.invoiceId);
      refresh();
    };
    window.addEventListener(TABLE_READY_EVENT, onEvent);
    window.addEventListener(TABLE_SERVED_EVENT, onServed);
    return () => {
      window.removeEventListener(TABLE_READY_EVENT, onEvent);
      window.removeEventListener(TABLE_SERVED_EVENT, onServed);
    };
  }, [refresh]);

  useEffect(() => {
    if (!active || (data?.pendingCount ?? 0) === 0) return;
    const timer = window.setInterval(refresh, 30000);
    return () => window.clearInterval(timer);
  }, [active, data?.pendingCount, refresh]);

  async function markServed(invoiceId: string) {
    setMarkingServedId(invoiceId);
    try {
      await api.post(`/v1/pos/invoices/${invoiceId}/mark-table-served`);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo marcar como servida");
    } finally {
      setMarkingServedId(null);
    }
  }

  if (loading && !data) {
    return <p style={{ color: "var(--t-muted)" }}>Cargando tablero del host…</p>;
  }

  if (!data) {
    return <p style={{ color: "var(--t-muted)" }}>No se pudo cargar el tablero.</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tablero del host</h2>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--t-muted)" }}>
            Mesas listas en cocina, agrupadas por mesero
          </p>
        </div>
        <button
          onClick={refresh}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
        >
          Actualizar
        </button>
        <button
          onClick={async () => {
            setExporting("csv");
            try { await downloadTableServiceTimesCsv(); } finally { setExporting(null); }
          }}
          disabled={exporting !== null}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
        >
          {exporting === "csv" ? "…" : "CSV"}
        </button>
        <button
          onClick={async () => {
            setExporting("pdf");
            try { await printTableServiceTimesReport(); } finally { setExporting(null); }
          }}
          disabled={exporting !== null}
          style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
        >
          {exporting === "pdf" ? "…" : "Imprimir PDF"}
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Kpi label="Pendientes de servir" value={String(data.pendingCount)} accent="#22c55e" />
        <Kpi label="Espera máxima ahora" value={`${data.longestPendingMinutes} min`} accent="#f59e0b" />
        <Kpi label="Promedio hoy (lista → servida)" value={`${data.avgWaitMinutesToday} min`} accent="#2563eb" />
        <Kpi label="Servidas hoy" value={String(data.servedCountToday)} accent="#64748b" />
      </div>

      {(data.overdueCount ?? 0) > 0 && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--t-danger-soft)",
          border: "2px solid #fca5a5",
          color: "#991b1b",
          fontSize: 14,
          fontWeight: 600,
        }}>
          ⚠️ {data.overdueCount} mesa{(data.overdueCount ?? 0) !== 1 ? "s" : ""} esperando más de {data.warnAfterMinutes ?? 10} min sin servir
          {overdueAlert.length > 0 && (
            <div style={{ marginTop: 8, fontWeight: 500, fontSize: 13 }}>
              {overdueAlert.slice(-3).map((row) => row.tableLabel).join(" · ")}
            </div>
          )}
        </div>
      )}

      {data.pendingCount === 0 ? (
        <div style={{
          background: "var(--t-success-soft)", border: "1px solid #bbf7d0", borderRadius: 12,
          padding: 20, marginBottom: 24, textAlign: "center", color: "#166534",
        }}>
          🟢 Sin mesas pendientes de servir en este momento
        </div>
      ) : (
        <div style={{ display: "grid", gap: 16, marginBottom: 24 }}>
          {data.pendingByWaiter.map((group) => (
            <section
              key={group.waiterId ?? group.waiterName}
              style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 16 }}
            >
              <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>
                {group.waiterName}
                <span style={{ marginLeft: 8, fontSize: 13, color: "var(--t-muted)", fontWeight: 500 }}>
                  {group.tables.length} mesa{group.tables.length !== 1 ? "s" : ""} lista{group.tables.length !== 1 ? "s" : ""}
                </span>
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {group.tables.map((row) => (
                  <div
                    key={row.invoiceId}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto auto auto auto auto",
                      gap: 10,
                      alignItems: "center",
                      background: row.isOverdue ? "#fef2f2" : "#ecfdf5",
                      border: row.isOverdue ? "1px solid #fca5a5" : "1px solid #bbf7d0",
                      borderRadius: 8,
                      padding: "10px 12px",
                      fontSize: 13,
                    }}
                  >
                    <div>
                      <strong>{row.tableLabel}</strong>
                      <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                        {row.itemsSummary ?? "Comanda"}
                        {" · "}
                        {new Date(row.readyAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        {" · "}
                        <span style={{ color: row.waitingMinutes >= 10 ? "#b91c1c" : "#166534", fontWeight: 600 }}>
                          {row.waitingMinutes} min esperando
                        </span>
                      </div>
                    </div>
                    <strong style={{ color: "#166534" }}>{formatCOP(Number(row.total))}</strong>
                    <button onClick={() => onOpenOrder(row.tableSessionId)} style={btnPrimary}>Abrir</button>
                    {row.hostWhatsAppLink && (
                      <a
                        href={row.hostWhatsAppLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px", borderRadius: 6, border: "none",
                          background: "#25D366", color: "#fff", cursor: "pointer", fontSize: 13,
                          textDecoration: "none", textAlign: "center",
                        }}
                      >
                        WhatsApp host
                      </a>
                    )}
                    {row.waiterWhatsAppLink && (
                      <a
                        href={row.waiterWhatsAppLink}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          padding: "6px 12px", borderRadius: 6, border: "none",
                          background: "#128C7E", color: "#fff", cursor: "pointer", fontSize: 13,
                          textDecoration: "none", textAlign: "center",
                        }}
                      >
                        WhatsApp mesero
                      </a>
                    )}
                    <button
                      onClick={() => markServed(row.invoiceId)}
                      disabled={markingServedId === row.invoiceId}
                      style={btnGhost}
                    >
                      {markingServedId === row.invoiceId ? "…" : "Servida"}
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <section style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 16 }}>
        <h3 style={{ margin: "0 0 12px", fontSize: 15 }}>Historial hoy — cocina lista → servida en mesa</h3>
        {data.servedToday.length === 0 ? (
          <p style={{ color: "var(--t-muted)", fontSize: 14, margin: 0 }}>Aún no hay entregas registradas hoy</p>
        ) : (
          <div style={{ display: "grid", gap: 8, maxHeight: 320, overflowY: "auto" }}>
            {data.servedToday.map((row) => (
              <div
                key={row.invoiceId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 13,
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--t-border)",
                }}
              >
                <div>
                  <strong>{row.tableLabel}</strong>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                    {row.waiterName}
                    {row.itemsSummary ? ` · ${row.itemsSummary}` : ""}
                    {" · "}
                    {new Date(row.readyAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    {" → "}
                    {new Date(row.servedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <span style={{
                  padding: "2px 8px",
                  borderRadius: 999,
                  background: row.waitMinutes >= 10 ? "#fef2f2" : "#eff6ff",
                  color: row.waitMinutes >= 10 ? "#b91c1c" : "#1d4ed8",
                  fontWeight: 600,
                  fontSize: 12,
                }}>
                  {row.waitMinutes} min
                </span>
                {row.tableSessionId && (
                  <button onClick={() => onOpenOrder(row.tableSessionId!)} style={btnGhostSmall}>Ver mesa</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "var(--t-card)", borderRadius: 12, padding: 14, border: "1px solid var(--t-border)", borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 11, color: "var(--t-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, border: "none",
  background: "#16a34a", color: "#fff", cursor: "pointer", fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)",
  background: "var(--t-card)", cursor: "pointer", fontSize: 13,
};

const btnGhostSmall: React.CSSProperties = {
  padding: "4px 8px", borderRadius: 6, border: "1px solid var(--t-border-strong)",
  background: "var(--t-card)", cursor: "pointer", fontSize: 11,
};
