import { useCallback, useEffect, useState } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
import { reprintInvoice, printCashReport } from "../lib/print";
import { downloadTableServiceTimesCsv, printTableServiceTimesReport, downloadTableServiceTimesWeeklyCsv, printTableServiceTimesWeeklyReport, getWeekStartMonday } from "../lib/tableServiceReport";
import { getStoredAuth } from "../lib/auth";

type DashboardData = {
  summary: {
    totalSales: number;
    totalTax: number;
    totalTips: number;
    invoiceCount: number;
    ticketAverage: number;
    fiscalAccepted: number;
    fiscalContingency: number;
    cashSessionOpen: boolean;
    voidedCount?: number;
    voidedTotal?: number;
  };
  paymentsByMethod: Record<string, number>;
  topProducts: { name: string; qty: number; total: number }[];
  salesByHour: { hour: number; total: number }[];
  tipsByWaiter: { waiterId: string; name: string; sales: number; tips: number; count: number }[];
  recentSales: { id: string; total: number; invoiceNumber?: string; paidAt: string; serviceType: string }[];
  voidedOrders?: {
    id: string;
    serviceType: string;
    total: number;
    voidedAt?: string | null;
    label: string;
    reason?: string | null;
    itemsSummary?: string;
  }[];
};

type CashMovement = {
  id: string;
  type: "withdrawal" | "deposit" | "expense" | string;
  amount: number;
  reason?: string | null;
  createdAt: string;
};

type CashReport = {
  sessionId?: string;
  status?: string;
  openingCash?: number;
  totalSales?: number;
  expectedCash?: number;
  invoiceCount?: number;
  paymentsByMethod?: Record<string, number>;
  cashSales?: number;
  deposits?: number;
  withdrawals?: number;
  expenses?: number;
  cashRegisterId?: string | null;
  cashRegisterName?: string | null;
  movements?: CashMovement[];
  message?: string;
};

type CashRegister = { id: string; name: string };

type SessionSummary = {
  id: string;
  status: string;
  openedAt: string;
  closedAt?: string | null;
  cashRegisterName?: string | null;
  openingCash: number;
  closingCash: number;
  expectedCash: number;
  cashDifference: number;
  invoiceCount: number;
  deposits: number;
  withdrawals: number;
  expenses: number;
};

type CashSessionReport = {
  sessionId: string;
  status: string;
  reportType: "X" | "Z";
  businessName: string;
  branchName: string;
  cashRegisterName?: string | null;
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  closingCash?: number | null;
  cashDifference?: number | null;
  totalSales: number;
  totalTips: number;
  expectedCash: number;
  cashSales?: number;
  deposits?: number;
  withdrawals?: number;
  expenses?: number;
  invoiceCount: number;
  paymentsByMethod: Record<string, number>;
  movements?: CashMovement[];
  notes?: string | null;
};

type TableServiceTimes = {
  date: string;
  summary: {
    servedCount: number;
    avgWaitMinutes: number;
    minWaitMinutes: number;
    maxWaitMinutes: number;
    sla?: {
      slaMinutes: number;
      withinSlaCount: number;
      compliancePct: number;
      breached: boolean;
    };
  };
  byWaiter: { waiterName: string; count: number; avgWaitMinutes: number }[];
  slaByWaiter?: {
    waiterId: string | null;
    waiterName: string;
    count: number;
    avgWaitMinutes: number;
    withinSlaCount: number;
    compliancePct: number;
    breached: boolean;
  }[];
  rows: {
    invoiceId: string;
    tableLabel: string;
    waiterName: string;
    readyAt: string;
    servedAt: string;
    waitMinutes: number;
    itemsSummary?: string;
  }[];
};

type WeeklyServiceTimes = {
  weekStart: string;
  weekEnd: string;
  summary: {
    servedCount: number;
    avgWaitMinutes: number;
    minWaitMinutes: number;
    maxWaitMinutes: number;
    sla?: {
      slaMinutes: number;
      withinSlaCount: number;
      compliancePct: number;
      breached: boolean;
    };
  };
  slaAlert?: { notified?: boolean; reason?: string };
  slaByWaiter?: {
    waiterId: string | null;
    waiterName: string;
    count: number;
    avgWaitMinutes: number;
    withinSlaCount: number;
    compliancePct: number;
    breached: boolean;
  }[];
  byShift: { shift: string; shiftLabel: string; servedCount: number; avgWaitMinutes: number }[];
  byDay: {
    date: string;
    servedCount: number;
    avgWaitMinutes: number;
    byShift: { shift: string; shiftLabel: string; servedCount: number; avgWaitMinutes: number }[];
  }[];
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  qr: "QR",
  credit: "Crédito",
  voucher: "Vale",
  mixed: "Mixto",
};

const MOVEMENT_LABELS: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retiro",
  expense: "Gasto",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default function Dashboard({ branchId }: { branchId: string }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [cash, setCash] = useState<CashReport | null>(null);
  const [registers, setRegisters] = useState<CashRegister[]>([]);
  const [selectedRegisterId, setSelectedRegisterId] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [sessionReport, setSessionReport] = useState<CashSessionReport | null>(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [printingReport, setPrintingReport] = useState(false);
  const [openingCash, setOpeningCash] = useState("150000");
  const [openingSession, setOpeningSession] = useState(false);
  const [movementType, setMovementType] = useState<"withdrawal" | "deposit" | "expense">("withdrawal");
  const [movementAmount, setMovementAmount] = useState("");
  const [movementReason, setMovementReason] = useState("");
  const [savingMovement, setSavingMovement] = useState(false);
  const [reportFrom, setReportFrom] = useState(todayISO);
  const [reportTo, setReportTo] = useState(todayISO);
  const [serviceTimes, setServiceTimes] = useState<TableServiceTimes | null>(null);
  const [weeklyTimes, setWeeklyTimes] = useState<WeeklyServiceTimes | null>(null);
  const [weekStart, setWeekStart] = useState(() => getWeekStartMonday());
  const [exportingTimes, setExportingTimes] = useState<"csv" | "pdf" | null>(null);
  const [exportingWeekly, setExportingWeekly] = useState<"csv" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, cashReport, timesReport, weeklyReport, regs, sess] = await Promise.all([
        api.get("/v1/reports/dashboard", { params: { from: reportFrom, to: reportTo } }),
        api.get("/v1/reports/cash"),
        api.get("/v1/reports/table-service-times").catch(() => ({ data: null })),
        api.get("/v1/reports/table-service-times/weekly", { params: { weekStart } }).catch(() => ({ data: null })),
        api.get("/v1/cash/registers").catch(() => ({ data: [] })),
        api.get("/v1/cash/sessions", { params: { take: 10 } }).catch(() => ({ data: [] })),
      ]);
      setData(dash.data);
      setCash(cashReport.data);
      setServiceTimes(timesReport.data);
      setWeeklyTimes(weeklyReport.data);
      setRegisters(regs.data ?? []);
      setSessions(sess.data ?? []);
    } finally {
      setLoading(false);
    }
  }, [weekStart, reportFrom, reportTo]);

  useEffect(() => { setBranchId(branchId); }, [branchId]);

  useEffect(() => { load(); }, [branchId, load]);

  useEffect(() => {
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function openCashSession() {
    const auth = getStoredAuth();
    if (!auth?.user?.id) return alert("Inicia sesión de nuevo");
    setOpeningSession(true);
    try {
      await api.post("/v1/cash/session/open", {
        userId: auth.user.id,
        openingCash: Number(openingCash) || 0,
        ...(selectedRegisterId ? { cashRegisterId: selectedRegisterId } : {}),
      });
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo abrir caja");
    } finally {
      setOpeningSession(false);
    }
  }

  async function addCashMovement() {
    if (!cash?.sessionId || !movementAmount) return;
    setSavingMovement(true);
    try {
      await api.post(`/v1/cash/session/${cash.sessionId}/movements`, {
        type: movementType,
        amount: Number(movementAmount),
        reason: movementReason.trim() || undefined,
      });
      setMovementAmount("");
      setMovementReason("");
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo registrar el movimiento");
    } finally {
      setSavingMovement(false);
    }
  }

  async function closeCash() {
    if (!cash?.sessionId || !closingCash) return;
    try {
      const res = await api.post(`/v1/cash/session/${cash.sessionId}/close`, {
        closingCash: Number(closingCash),
        notes: closeNotes.trim() || undefined,
      });
      setClosingCash("");
      setCloseNotes("");
      await load();
      const z = await api.get(`/v1/cash/session/${res.data.id}/report-z`);
      setSessionReport(z.data);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo cerrar caja");
    }
  }

  async function handleReprint(invoiceId: string) {
    setPrintingId(invoiceId);
    try {
      const result = await reprintInvoice(invoiceId);
      if (!result.ok) alert("No se pudo imprimir el tiquete");
    } finally {
      setPrintingId(null);
    }
  }

  async function showSessionReport(sessionId?: string) {
    const id = sessionId ?? cash?.sessionId;
    if (!id) return alert("No hay sesión de caja");
    setLoadingReport(true);
    try {
      const res = await api.get(`/v1/cash/session/${id}/report`);
      setSessionReport(res.data);
    } catch {
      alert("No se pudo cargar el reporte");
    } finally {
      setLoadingReport(false);
    }
  }

  async function handlePrintSessionReport() {
    if (!sessionReport?.sessionId) return;
    setPrintingReport(true);
    try {
      const result = await printCashReport(sessionReport.sessionId);
      if (!result.ok) alert("Print Agent no disponible — configure impresora en puerto 9101");
    } finally {
      setPrintingReport(false);
    }
  }

  function serviceLabel(type: string) {
    if (type === "dine_in") return "Mesa";
    if (type === "counter") return "Mostrador";
    return type;
  }

  if (loading && !data) return <div>Cargando dashboard…</div>;
  if (!data) return <div>Sin datos</div>;

  const maxHour = Math.max(...data.salesByHour.map((h) => h.total), 1);
  const closedSessions = sessions.filter((s) => s.status === "closed");

  return (
    <div>
      {sessionReport && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 440, maxWidth: "92vw", maxHeight: "90vh", overflowY: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <h3 style={{ margin: 0 }}>Reporte {sessionReport.reportType}</h3>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--t-muted)" }}>
                  {sessionReport.businessName} · {sessionReport.branchName}
                  {sessionReport.cashRegisterName ? ` · ${sessionReport.cashRegisterName}` : ""}
                </p>
              </div>
              <button onClick={() => setSessionReport(null)} style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "var(--t-muted)" }}>×</button>
            </div>

            <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 12 }}>
              Apertura: {new Date(sessionReport.openedAt).toLocaleString("es-CO")}
              {sessionReport.closedAt ? ` · Cierre: ${new Date(sessionReport.closedAt).toLocaleString("es-CO")}` : ""}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <ReportKpi label="Ventas sesión" value={formatCOP(sessionReport.totalSales)} />
              <ReportKpi label="Transacciones" value={String(sessionReport.invoiceCount)} />
              <ReportKpi label="Propinas" value={formatCOP(sessionReport.totalTips ?? 0)} />
              <ReportKpi label="Efectivo esperado" value={formatCOP(sessionReport.expectedCash)} />
              {sessionReport.closingCash != null && (
                <>
                  <ReportKpi label="Efectivo contado" value={formatCOP(sessionReport.closingCash)} />
                  <ReportKpi label="Diferencia" value={formatCOP(sessionReport.cashDifference ?? 0)} />
                </>
              )}
            </div>

            <div style={{ background: "var(--t-card-alt)", borderRadius: 10, padding: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Arqueo</div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>Apertura</span><strong>{formatCOP(sessionReport.openingCash)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>Ventas efectivo</span><strong>{formatCOP(sessionReport.cashSales ?? 0)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>Depósitos</span><strong>{formatCOP(sessionReport.deposits ?? 0)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                <span>Retiros</span><strong>{formatCOP(sessionReport.withdrawals ?? 0)}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                <span>Gastos</span><strong>{formatCOP(sessionReport.expenses ?? 0)}</strong>
              </div>
            </div>

            <div style={{ background: "var(--t-card-alt)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Medios de pago</div>
              {Object.entries(sessionReport.paymentsByMethod).length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--t-muted)" }}>Sin pagos registrados</p>
              ) : (
                Object.entries(sessionReport.paymentsByMethod).map(([method, amount]) => (
                  <div key={method} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 4 }}>
                    <span>{PAYMENT_LABELS[method] ?? method}</span>
                    <strong>{formatCOP(Number(amount))}</strong>
                  </div>
                ))
              )}
            </div>

            {(sessionReport.movements?.length ?? 0) > 0 && (
              <div style={{ background: "var(--t-card-alt)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Movimientos</div>
                {sessionReport.movements!.map((m) => (
                  <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4, gap: 8 }}>
                    <span>
                      {MOVEMENT_LABELS[m.type] ?? m.type}
                      {m.reason ? ` · ${m.reason}` : ""}
                    </span>
                    <strong>{formatCOP(m.amount)}</strong>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={handlePrintSessionReport}
                disabled={printingReport}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer" }}
              >
                {printingReport ? "Imprimiendo…" : "🖨️ Imprimir térmica"}
              </button>
              <button
                onClick={() => setSessionReport(null)}
                style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
            <p style={{ margin: "12px 0 0", fontSize: 11, color: "var(--t-muted)", textAlign: "center" }}>
              {sessionReport.reportType === "Z" ? "Cierre de caja (Z)" : "Caja abierta — no es cierre Z"}
            </p>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <h2 style={{ margin: 0 }}>
          Dashboard
          {reportFrom === reportTo ? ` — ${reportFrom}` : ` — ${reportFrom} → ${reportTo}`}
        </h2>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Desde
            <input
              type="date"
              value={reportFrom}
              onChange={(e) => setReportFrom(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--t-border-strong)" }}
            />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            Hasta
            <input
              type="date"
              value={reportTo}
              onChange={(e) => setReportTo(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--t-border-strong)" }}
            />
          </label>
          <button
            onClick={() => { setReportFrom(todayISO()); setReportTo(todayISO()); }}
            style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer", fontSize: 13 }}
          >
            Hoy
          </button>
          <button onClick={load} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>
            Actualizar
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
        <Kpi label={reportFrom === reportTo ? "Ventas hoy" : "Ventas periodo"} value={formatCOP(data.summary.totalSales)} accent="#2563eb" />
        <Kpi label="Transacciones" value={String(data.summary.invoiceCount)} accent="#7c3aed" />
        <Kpi label="Ticket promedio" value={formatCOP(data.summary.ticketAverage)} accent="#0891b2" />
        <Kpi label="IVA recaudado" value={formatCOP(data.summary.totalTax)} accent="#059669" />
        <Kpi label="Propinas" value={formatCOP(data.summary.totalTips ?? 0)} accent="#d97706" />
        <Kpi label="DE POS OK" value={String(data.summary.fiscalAccepted)} accent="#16a34a" />
        <Kpi label="Contingencia" value={String(data.summary.fiscalContingency)} accent={data.summary.fiscalContingency ? "#dc2626" : "#94a3b8"} />
        <Kpi label="Anulados" value={String(data.summary.voidedCount ?? 0)} accent="#dc2626" />
        <Kpi label="Valor anulado" value={formatCOP(data.summary.voidedTotal ?? 0)} accent="#b91c1c" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <Card title="Ventas por hora">
          {data.salesByHour.length === 0 ? (
            <p style={{ color: "var(--t-muted)", fontSize: 14 }}>Sin ventas aún hoy</p>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 100 }}>
              {data.salesByHour.map((h) => (
                <div key={h.hour} style={{ flex: 1, textAlign: "center" }}>
                  <div style={{
                    height: `${(h.total / maxHour) * 80}px`, background: "#2563eb",
                    borderRadius: "4px 4px 0 0", minHeight: 4,
                  }} title={formatCOP(h.total)} />
                  <div style={{ fontSize: 10, color: "var(--t-muted)", marginTop: 4 }}>{h.hour}h</div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Medios de pago">
          {Object.entries(data.paymentsByMethod).map(([method, amount]) => (
            <div key={method} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
              <span style={{ textTransform: "capitalize" }}>{method}</span>
              <strong>{formatCOP(amount)}</strong>
            </div>
          ))}
          {Object.keys(data.paymentsByMethod).length === 0 && (
            <p style={{ color: "var(--t-muted)", fontSize: 14 }}>Sin pagos registrados</p>
          )}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card title="Top productos">
          {data.topProducts.map((p, i) => (
            <div key={p.name} style={{ display: "flex", gap: 8, fontSize: 14, marginBottom: 8 }}>
              <span style={{ color: "var(--t-muted)", width: 20 }}>{i + 1}.</span>
              <span style={{ flex: 1 }}>{p.name}</span>
              <span style={{ color: "var(--t-muted)" }}>x{p.qty.toFixed(1)}</span>
              <strong>{formatCOP(p.total)}</strong>
            </div>
          ))}
        </Card>

        <Card title="Caja">
          {cash?.message ? (
            <>
              <p style={{ color: "var(--t-muted)", marginBottom: 12 }}>{cash.message}</p>
              {registers.length > 0 && (
                <label style={{ display: "grid", gap: 6, fontSize: 14, marginBottom: 10 }}>
                  Caja registradora
                  <select
                    value={selectedRegisterId}
                    onChange={(e) => setSelectedRegisterId(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                  >
                    <option value="">Sin asignar</option>
                    {registers.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
                Efectivo inicial
                <input
                  value={openingCash}
                  onChange={(e) => setOpeningCash(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                />
              </label>
              <button
                onClick={openCashSession}
                disabled={openingSession}
                style={{ marginTop: 10, padding: "10px 14px", borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}
              >
                {openingSession ? "Abriendo…" : "Abrir caja del día"}
              </button>
            </>
          ) : (
            <>
              <Row label="Estado" value={cash?.status === "open" ? "🟢 Abierta" : "Cerrada"} />
              {cash?.cashRegisterName && <Row label="Caja" value={cash.cashRegisterName} />}
              <Row label="Apertura" value={formatCOP(cash?.openingCash ?? 0)} />
              <Row label="Ventas sesión" value={formatCOP(cash?.totalSales ?? 0)} />
              <Row label="Ventas efectivo" value={formatCOP(cash?.cashSales ?? 0)} />
              {(cash?.deposits ?? 0) > 0 && <Row label="Depósitos" value={formatCOP(cash!.deposits!)} />}
              {(cash?.withdrawals ?? 0) > 0 && <Row label="Retiros" value={formatCOP(cash!.withdrawals!)} />}
              {(cash?.expenses ?? 0) > 0 && <Row label="Gastos" value={formatCOP(cash!.expenses!)} />}
              <Row label="Efectivo esperado" value={formatCOP(cash?.expectedCash ?? 0)} />
              {cash?.status === "open" && (
                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  <div style={{ background: "var(--t-card-alt)", borderRadius: 10, padding: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Movimiento de caja</div>
                    <div style={{ display: "grid", gap: 8 }}>
                      <select
                        value={movementType}
                        onChange={(e) => setMovementType(e.target.value as typeof movementType)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                      >
                        <option value="withdrawal">Retiro</option>
                        <option value="deposit">Depósito</option>
                        <option value="expense">Gasto</option>
                      </select>
                      <input
                        placeholder="Monto"
                        value={movementAmount}
                        onChange={(e) => setMovementAmount(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                      />
                      <input
                        placeholder="Motivo (opcional)"
                        value={movementReason}
                        onChange={(e) => setMovementReason(e.target.value)}
                        style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                      />
                      <button
                        onClick={addCashMovement}
                        disabled={savingMovement || !movementAmount}
                        style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer" }}
                      >
                        {savingMovement ? "Guardando…" : "Registrar movimiento"}
                      </button>
                    </div>
                    {(cash.movements?.length ?? 0) > 0 && (
                      <div style={{ marginTop: 10, maxHeight: 120, overflowY: "auto" }}>
                        {cash.movements!.slice(0, 8).map((m) => (
                          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, gap: 6 }}>
                            <span style={{ color: "var(--t-muted)" }}>
                              {MOVEMENT_LABELS[m.type] ?? m.type}
                              {m.reason ? ` · ${m.reason}` : ""}
                            </span>
                            <strong>{formatCOP(m.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => showSessionReport()} disabled={loadingReport} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer" }}>
                    {loadingReport ? "Cargando…" : "Ver reporte X"}
                  </button>
                  <input
                    placeholder="Efectivo contado"
                    value={closingCash}
                    onChange={(e) => setClosingCash(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                  />
                  <input
                    placeholder="Notas de cierre (opcional)"
                    value={closeNotes}
                    onChange={(e) => setCloseNotes(e.target.value)}
                    style={{ padding: 8, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}
                  />
                  <button onClick={closeCash} style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--t-red-fg)", color: "var(--t-primary-fg)", cursor: "pointer" }}>
                    Cerrar caja (Z)
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {closedSessions.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title="Historial de cierres">
            {closedSessions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 12,
                  alignItems: "center",
                  fontSize: 13,
                  marginBottom: 10,
                  paddingBottom: 10,
                  borderBottom: "1px solid var(--t-border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>
                    {new Date(s.openedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                    {s.cashRegisterName ? ` · ${s.cashRegisterName}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t-muted)" }}>
                    Contado {formatCOP(s.closingCash)} · Esp. {formatCOP(s.expectedCash)} · Diff. {formatCOP(s.cashDifference)}
                    {" · "}{s.invoiceCount} facturas
                  </div>
                </div>
                <button
                  onClick={() => showSessionReport(s.id)}
                  disabled={loadingReport}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 12 }}
                >
                  Ver Z
                </button>
              </div>
            ))}
          </Card>
        </div>
      )}

      {data.tipsByWaiter?.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <Card title={`Propinas por mesero${reportFrom === reportTo ? " — día" : " — periodo"}`}>
            {data.tipsByWaiter.map((w) => (
              <div key={w.waiterId} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12,
                fontSize: 14, marginBottom: 10, paddingBottom: 10, borderBottom: "1px solid var(--t-border)",
              }}>
                <div style={{ fontWeight: 600 }}>{w.name}</div>
                <span style={{ color: "var(--t-muted)" }}>{w.count} mesas</span>
                <span>{formatCOP(w.sales)}</span>
                <strong style={{ color: "#d97706" }}>{formatCOP(w.tips)} propina</strong>
              </div>
            ))}
          </Card>
        </div>
      )}

      {serviceTimes && (
        <div style={{ marginTop: 16 }}>
          <Card title="Tiempos mesa — cocina lista → servida (hoy)">
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                onClick={async () => {
                  setExportingTimes("csv");
                  try { await downloadTableServiceTimesCsv(serviceTimes.date); } finally { setExportingTimes(null); }
                }}
                disabled={exportingTimes !== null}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
              >
                {exportingTimes === "csv" ? "…" : "Descargar CSV"}
              </button>
              <button
                onClick={async () => {
                  setExportingTimes("pdf");
                  try { await printTableServiceTimesReport(serviceTimes.date); } finally { setExportingTimes(null); }
                }}
                disabled={exportingTimes !== null}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
              >
                {exportingTimes === "pdf" ? "…" : "Imprimir PDF"}
              </button>
            </div>
            {serviceTimes.summary.servedCount === 0 ? (
              <p style={{ color: "var(--t-muted)", fontSize: 14, margin: 0 }}>Sin entregas registradas hoy</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
                  <ReportKpi label="Entregas" value={String(serviceTimes.summary.servedCount)} />
                  <ReportKpi label="Promedio" value={`${serviceTimes.summary.avgWaitMinutes} min`} />
                  <ReportKpi label="Mínimo" value={`${serviceTimes.summary.minWaitMinutes} min`} />
                  <ReportKpi label="Máximo" value={`${serviceTimes.summary.maxWaitMinutes} min`} />
                  {serviceTimes.summary.sla && (
                    <>
                      <ReportKpi label="Meta SLA" value={`${serviceTimes.summary.sla.slaMinutes} min`} />
                      <ReportKpi
                        label="Cumplimiento SLA"
                        value={`${serviceTimes.summary.sla.compliancePct}%`}
                      />
                    </>
                  )}
                </div>
                {serviceTimes.summary.sla?.breached && (
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                    ⚠️ Promedio de hoy supera la meta SLA ({serviceTimes.summary.sla.slaMinutes} min)
                  </p>
                )}
                {serviceTimes.slaByWaiter && serviceTimes.slaByWaiter.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>
                      Cumplimiento SLA por mesero (meta {serviceTimes.summary.sla?.slaMinutes ?? 8} min)
                    </div>
                    {serviceTimes.slaByWaiter.map((w) => (
                      <div key={w.waiterId ?? w.waiterName} style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12,
                        fontSize: 13, marginBottom: 6, alignItems: "center",
                      }}>
                        <span>{w.waiterName}</span>
                        <span style={{ color: "var(--t-muted)" }}>{w.withinSlaCount}/{w.count}</span>
                        <span style={{ color: w.breached ? "var(--t-danger-fg)" : "var(--t-success-fg)", fontWeight: 600 }}>
                          {w.compliancePct}%
                        </span>
                        <strong style={{ color: w.breached ? "var(--t-danger-fg)" : "var(--t-link)" }}>
                          {w.avgWaitMinutes} min
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {serviceTimes.byWaiter.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>Por mesero</div>
                    {serviceTimes.byWaiter.map((w) => (
                      <div key={w.waiterName} style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12,
                        fontSize: 13, marginBottom: 6,
                      }}>
                        <span>{w.waiterName}</span>
                        <span style={{ color: "var(--t-muted)" }}>{w.count} entregas</span>
                        <strong>{w.avgWaitMinutes} min prom.</strong>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ maxHeight: 240, overflowY: "auto" }}>
                  {serviceTimes.rows.slice(0, 15).map((row) => (
                    <div key={row.invoiceId} style={{
                      display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
                      fontSize: 13, marginBottom: 8, paddingBottom: 8, borderBottom: "1px solid var(--t-border)",
                    }}>
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
                      <strong style={{ color: row.waitMinutes >= 10 ? "var(--t-danger-fg)" : "var(--t-link)" }}>
                        {row.waitMinutes} min
                      </strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {weeklyTimes && (
        <div style={{ marginTop: 16 }}>
          <Card title="Reporte semanal por turno — tiempos mesa">
            <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                Semana desde
                <input
                  type="date"
                  value={weekStart}
                  onChange={(e) => setWeekStart(e.target.value)}
                  style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid var(--t-border-strong)" }}
                />
              </label>
              <button
                onClick={load}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
              >
                Actualizar
              </button>
              <button
                onClick={async () => {
                  setExportingWeekly("csv");
                  try { await downloadTableServiceTimesWeeklyCsv(weekStart); } finally { setExportingWeekly(null); }
                }}
                disabled={exportingWeekly !== null}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
              >
                {exportingWeekly === "csv" ? "…" : "CSV semanal"}
              </button>
              <button
                onClick={async () => {
                  setExportingWeekly("pdf");
                  try { await printTableServiceTimesWeeklyReport(weekStart); } finally { setExportingWeekly(null); }
                }}
                disabled={exportingWeekly !== null}
                style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
              >
                {exportingWeekly === "pdf" ? "…" : "PDF semanal"}
              </button>
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--t-muted)" }}>
              {weeklyTimes.weekStart} — {weeklyTimes.weekEnd}
              {" · "}
              Turnos: almuerzo 11–15h, cena 18–23h, otro resto del día
            </p>
            {weeklyTimes.summary.servedCount === 0 ? (
              <p style={{ color: "var(--t-muted)", fontSize: 14, margin: 0 }}>Sin entregas en esta semana</p>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 14 }}>
                  <ReportKpi label="Entregas" value={String(weeklyTimes.summary.servedCount)} />
                  <ReportKpi label="Promedio" value={`${weeklyTimes.summary.avgWaitMinutes} min`} />
                  <ReportKpi label="Mínimo" value={`${weeklyTimes.summary.minWaitMinutes} min`} />
                  <ReportKpi label="Máximo" value={`${weeklyTimes.summary.maxWaitMinutes} min`} />
                  {weeklyTimes.summary.sla && (
                    <>
                      <ReportKpi label="Meta SLA" value={`${weeklyTimes.summary.sla.slaMinutes} min`} />
                      <ReportKpi label="Cumplimiento SLA" value={`${weeklyTimes.summary.sla.compliancePct}%`} />
                    </>
                  )}
                </div>
                {weeklyTimes.summary.sla?.breached && (
                  <p style={{ margin: "0 0 12px", fontSize: 13, color: "#b91c1c", fontWeight: 600 }}>
                    ⚠️ Promedio semanal supera la meta SLA ({weeklyTimes.summary.sla.slaMinutes} min)
                    {weeklyTimes.slaAlert?.notified ? " · Webhook enviado" : ""}
                  </p>
                )}
                {weeklyTimes.slaByWaiter && weeklyTimes.slaByWaiter.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>
                      Cumplimiento SLA por mesero (semana)
                    </div>
                    {weeklyTimes.slaByWaiter.map((w) => (
                      <div key={w.waiterId ?? w.waiterName} style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12,
                        fontSize: 13, marginBottom: 6, alignItems: "center",
                      }}>
                        <span>{w.waiterName}</span>
                        <span style={{ color: "var(--t-muted)" }}>{w.withinSlaCount}/{w.count}</span>
                        <span style={{ color: w.breached ? "var(--t-danger-fg)" : "var(--t-success-fg)", fontWeight: 600 }}>
                          {w.compliancePct}%
                        </span>
                        <strong style={{ color: w.breached ? "var(--t-danger-fg)" : "var(--t-link)" }}>
                          {w.avgWaitMinutes} min prom.
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
                {weeklyTimes.byShift.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>Por turno (semana)</div>
                    {weeklyTimes.byShift.map((row) => (
                      <div key={row.shift} style={{
                        display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12,
                        fontSize: 13, marginBottom: 6,
                      }}>
                        <span>{row.shiftLabel}</span>
                        <span style={{ color: "var(--t-muted)" }}>{row.servedCount} entregas</span>
                        <strong>{row.avgWaitMinutes} min prom.</strong>
                      </div>
                    ))}
                  </div>
                )}
                {weeklyTimes.byDay.length > 0 && (
                  <div style={{ maxHeight: 260, overflowY: "auto" }}>
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>Por día y turno</div>
                    {weeklyTimes.byDay.flatMap((day) =>
                      day.byShift.map((shift) => (
                        <div
                          key={`${day.date}-${shift.shift}`}
                          style={{
                            display: "grid", gridTemplateColumns: "auto 1fr auto auto", gap: 12,
                            fontSize: 13, marginBottom: 6, paddingBottom: 6, borderBottom: "1px solid var(--t-border)",
                          }}
                        >
                          <span style={{ color: "var(--t-muted)" }}>{day.date}</span>
                          <span>{shift.shiftLabel}</span>
                          <span style={{ color: "var(--t-muted)" }}>{shift.servedCount} ent.</span>
                          <strong>{shift.avgWaitMinutes} min</strong>
                        </div>
                      )),
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Card title={`Pedidos anulados${reportFrom === reportTo ? " — día" : " — periodo"}`}>
          {(data.voidedOrders?.length ?? 0) === 0 ? (
            <p style={{ color: "var(--t-muted)", fontSize: 14 }}>Sin anulaciones registradas hoy</p>
          ) : (
            data.voidedOrders!.map((order) => (
              <div key={order.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto", gap: 12,
                alignItems: "center", fontSize: 14, marginBottom: 10, paddingBottom: 10,
                borderBottom: "1px solid var(--t-border)",
              }}>
                <div>
                  <div style={{ fontWeight: 600, color: "#b91c1c" }}>{order.label}</div>
                  <div style={{ fontSize: 12, color: "var(--t-muted)" }}>
                    {serviceLabel(order.serviceType)}
                    {order.voidedAt ? ` · ${new Date(order.voidedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    {order.itemsSummary ? ` · ${order.itemsSummary}` : ""}
                  </div>
                  {order.reason && (
                    <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 2 }}>{order.reason}</div>
                  )}
                </div>
                <strong>{formatCOP(order.total)}</strong>
              </div>
            ))
          )}
        </Card>
      </div>

      <div style={{ marginTop: 16 }}>
        <Card title="Últimas ventas">
          {data.recentSales.length === 0 ? (
            <p style={{ color: "var(--t-muted)", fontSize: 14 }}>Sin ventas pagadas hoy</p>
          ) : (
            data.recentSales.map((sale) => (
              <div key={sale.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 12,
                alignItems: "center", fontSize: 14, marginBottom: 10, paddingBottom: 10,
                borderBottom: "1px solid var(--t-border)",
              }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{formatCOP(sale.total)}</div>
                  <div style={{ fontSize: 12, color: "var(--t-muted)" }}>
                    {serviceLabel(sale.serviceType)} · {new Date(sale.paidAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    {sale.invoiceNumber ? ` · ${sale.invoiceNumber}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => handleReprint(sale.id)}
                  disabled={printingId === sale.id}
                  style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
                >
                  {printingId === sale.id ? "…" : "🖨️ Reimprimir"}
                </button>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}

function ReportKpi({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 11, color: "var(--t-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: "var(--t-card)", borderRadius: 12, padding: 16, border: "1px solid var(--t-border)", borderTop: `3px solid ${accent}` }}>
      <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--t-card)", borderRadius: 12, padding: 16, border: "1px solid var(--t-border)" }}>
      <h4 style={{ margin: "0 0 12px", fontSize: 15 }}>{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
      <span style={{ color: "var(--t-muted)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
