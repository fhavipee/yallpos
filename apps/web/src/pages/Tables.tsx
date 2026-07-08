import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
import { printSeatingSlip as printSeatingSlipTicket } from "../lib/print";
import { notifyOverdueTables, type OverdueTableRow } from "../lib/tableServiceReport";
import { TABLE_UPDATED_EVENT, TABLE_READY_EVENT, TABLE_SERVED_EVENT, dispatchTableUpdated, type TableUpdatedDetail, type TableReadyDetail, type TableServedDetail } from "../lib/kdsSocket";
import { matchesOrderWaiter, orderReadyActionLabel } from "../lib/kitchenReady";
import type { WaiterIdentity } from "../lib/pin";
import { toWaiterApiBody } from "../lib/waiterAttribution";

type SessionInvoice = {
  id: string;
  total: string | number;
  status: string;
  kitchenReadyPending?: boolean;
};

type TableSession = {
  id: string;
  guestsCount?: number;
  waiterId?: string;
  waiterUserId?: string;
  waiterName?: string;
  openInvoiceCount?: number;
  canClose?: boolean;
  kitchenReadyPending?: boolean;
  invoices?: SessionInvoice[];
};

type TableReadyRow = {
  invoiceId: string;
  tableSessionId: string;
  tableId?: string | null;
  tableLabel: string;
  itemsSummary?: string;
  total: string | number;
  waiterName: string;
  readyAt: string;
  waitingMinutes?: number;
  isOverdue?: boolean;
  warnAfterMinutes?: number;
  hostWhatsAppLink?: string | null;
  waiterWhatsAppLink?: string | null;
};

type Table = {
  id: string;
  name: string;
  capacity: number;
  area?: { name: string };
  sessions?: TableSession[];
};

type Reservation = {
  id: string;
  customerName: string;
  customerPhone?: string;
  guestsCount: number;
  reservedFor: string;
  status: string;
  notes?: string;
  whatsappLink?: string | null;
  reminderWhatsAppLink?: string | null;
  seatedWhatsAppLink?: string | null;
  cancelWhatsAppLink?: string | null;
  table?: { id: string; name: string; area?: { name: string } };
};

export default function Tables({
  branchId,
  active,
  onOpenOrder,
  activeWaiter,
}: {
  branchId: string;
  active?: boolean;
  onOpenOrder: (sessionId: string) => void;
  activeWaiter?: WaiterIdentity | null;
}) {
  const [tables, setTables] = useState<Table[]>([]);
  const [waiters, setWaiters] = useState<{ id: string; name: string }[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [guests, setGuests] = useState(2);
  const [waiterId, setWaiterId] = useState("");
  const [transferring, setTransferring] = useState<{ sessionId: string; tableName: string; currentWaiterId?: string } | null>(null);
  const [transferWaiterId, setTransferWaiterId] = useState("");
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [showReservation, setShowReservation] = useState(false);
  const [waPreview, setWaPreview] = useState<{ message: string; whatsappLink: string | null; hasPhone: boolean } | null>(null);
  const [waPreviewLoading, setWaPreviewLoading] = useState(false);
  const [newReservation, setNewReservation] = useState({
    customerName: "",
    customerPhone: "",
    guestsCount: "2",
    reservedFor: "",
    tableId: "",
    notes: "",
  });
  const [remindMinutes, setRemindMinutes] = useState(30);
  const [reservationSound, setReservationSound] = useState(true);
  const [printSeatingSlipEnabled, setPrintSeatingSlipEnabled] = useState(true);
  const [tableReadySound, setTableReadySound] = useState(true);
  const [tableReadyWarnMinutes, setTableReadyWarnMinutes] = useState(10);
  const [tableReadyOverdueSound, setTableReadyOverdueSound] = useState(true);
  const overdueWarnedRef = useRef(new Set<string>());
  const [overdueAlert, setOverdueAlert] = useState<OverdueTableRow[]>([]);
  const notifiedRef = useRef(new Set<string>());
  const [flashTable, setFlashTable] = useState<{ tableId: string; status?: TableUpdatedDetail["status"] } | null>(null);
  const [closingSessionId, setClosingSessionId] = useState<string | null>(null);
  const [alertReservationId, setAlertReservationId] = useState<string | null>(null);
  const [readyTableAlert, setReadyTableAlert] = useState<TableReadyDetail | null>(null);
  const [readyQueue, setReadyQueue] = useState<TableReadyRow[]>([]);
  const [markingServedId, setMarkingServedId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [t, w, r, q] = await Promise.all([
      api.get("/v1/restaurant/tables"),
      api.get("/v1/restaurant/waiters"),
      api.get("/v1/restaurant/reservations"),
      api.get("/v1/pos/table-ready-queue"),
    ]);
    setTables(t.data);
    setWaiters(w.data);
    setReservations(r.data);
    setReadyQueue(q.data);
    setWaiterId((current) => current || w.data[0]?.id || "");
  }, []);

  const loadBranchSettings = useCallback(async () => {
    try {
      const r = await api.get("/v1/settings/branch");
      const n = r.data?.notifications ?? {};
      if (n.reservationRemindMinutes) setRemindMinutes(Number(n.reservationRemindMinutes));
      setReservationSound(n.reservationSoundEnabled !== false);
      setPrintSeatingSlipEnabled(n.printSeatingSlipOnReservation !== false);
      setTableReadySound(n.tableReadySoundEnabled !== false);
      setTableReadyWarnMinutes(Number(n.tableReadyWarnMinutes) || 10);
      setTableReadyOverdueSound(n.tableReadyOverdueSoundEnabled !== false);
    } catch {
      // ignorar
    }
  }, []);

  useEffect(() => {
    setBranchId(branchId);
    refresh();
    loadBranchSettings();
  }, [branchId, refresh, loadBranchSettings]);

  useEffect(() => {
    if (!showReservation || !newReservation.customerName.trim() || !newReservation.reservedFor) {
      setWaPreview(null);
      return;
    }

    const timer = window.setTimeout(async () => {
      setWaPreviewLoading(true);
      try {
        const res = await api.post("/v1/restaurant/reservations/whatsapp-preview", {
          customerName: newReservation.customerName.trim(),
          customerPhone: newReservation.customerPhone.trim() || undefined,
          guestsCount: Number(newReservation.guestsCount) || 2,
          reservedFor: new Date(newReservation.reservedFor).toISOString(),
          tableId: newReservation.tableId || undefined,
          notes: newReservation.notes.trim() || undefined,
        });
        setWaPreview(res.data);
      } catch {
        setWaPreview(null);
      } finally {
        setWaPreviewLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [showReservation, newReservation]);

  useEffect(() => {
    if (!active || typeof Notification === "undefined") return;

    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    const poll = async () => {
      try {
        const res = await api.get(`/v1/restaurant/reservations/upcoming?withinMinutes=${remindMinutes + 5}`);
        const now = Date.now();
        for (const r of res.data as Reservation[]) {
          if (notifiedRef.current.has(r.id)) continue;
          const diffMin = (new Date(r.reservedFor).getTime() - now) / 60000;
          if (diffMin <= remindMinutes && diffMin >= -5) {
            notifiedRef.current.add(r.id);
            const time = new Date(r.reservedFor).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
            const body = `${r.customerName} · ${r.guestsCount} pax · ${time}${r.table ? ` · Mesa ${r.table.name}` : ""}`;
            if (Notification.permission === "granted") {
              new Notification("Reserva próxima", { body });
            }
            if (reservationSound) {
              playReservationTone();
            }
            setAlertReservationId(r.id);
            window.setTimeout(() => setAlertReservationId((current) => (current === r.id ? null : current)), 15000);
          }
        }
      } catch {
        // ignorar errores de poll
      }
    };

    poll();
    const id = window.setInterval(poll, 60000);
    return () => window.clearInterval(id);
  }, [active, branchId, remindMinutes, reservationSound]);

  useEffect(() => {
    if (active) {
      refresh();
      loadBranchSettings();
    }
  }, [active, refresh, loadBranchSettings]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableUpdatedDetail>).detail;
      refresh();
      if (detail?.tableId) {
        setFlashTable({ tableId: detail.tableId, status: detail.status });
        window.setTimeout(() => setFlashTable(null), 1800);
      }
    };
    window.addEventListener(TABLE_UPDATED_EVENT, handler);
    return () => window.removeEventListener(TABLE_UPDATED_EVENT, handler);
  }, [refresh]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableReadyDetail>).detail;
      if (!detail?.tableLabel && !detail?.orderLabel) return;
      if (!matchesOrderWaiter(detail, activeWaiter)) return;
      setReadyTableAlert(detail);
      window.setTimeout(() => setReadyTableAlert(null), 15000);
      refresh();
      if (detail.tableId) {
        setFlashTable({ tableId: detail.tableId, status: "updated" });
        window.setTimeout(() => setFlashTable(null), 3000);
      }
      if (tableReadySound) playTableReadyTone();
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        const label = detail.orderLabel ?? detail.tableLabel ?? "Pedido";
        new Notification("Pedido listo en cocina", {
          body: `${label}${detail.itemsSummary ? ` · ${detail.itemsSummary}` : ""}`,
        });
      }
    };
    window.addEventListener(TABLE_READY_EVENT, handler);
    return () => window.removeEventListener(TABLE_READY_EVENT, handler);
  }, [tableReadySound, refresh, activeWaiter?.id, activeWaiter?.kind]);

  useEffect(() => {
    if (!active || readyQueue.length === 0) {
      setOverdueAlert([]);
      return;
    }
    const overdue = notifyOverdueTables(
      readyQueue.map((row) => ({
        invoiceId: row.invoiceId,
        tableLabel: row.tableLabel,
        waiterName: row.waiterName,
        waitingMinutes: row.waitingMinutes ?? 0,
        isOverdue: row.isOverdue,
      })),
      overdueWarnedRef.current,
      {
        warnAfterMinutes: tableReadyWarnMinutes,
        soundEnabled: tableReadyOverdueSound,
      },
    );
    setOverdueAlert(overdue ?? []);
  }, [readyQueue, active, tableReadyWarnMinutes, tableReadyOverdueSound]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<TableServedDetail>).detail;
      setReadyTableAlert(null);
      if (detail?.invoiceId) overdueWarnedRef.current.delete(detail.invoiceId);
      refresh();
      if (detail?.tableId) {
        setFlashTable({ tableId: detail.tableId, status: "updated" });
        window.setTimeout(() => setFlashTable(null), 1200);
      }
    };
    window.addEventListener(TABLE_SERVED_EVENT, handler);
    return () => window.removeEventListener(TABLE_SERVED_EVENT, handler);
  }, [refresh]);

  const grouped = useMemo(() => {
    const map: Record<string, Table[]> = {};
    for (const t of tables) {
      const key = t.area?.name || "General";
      (map[key] ??= []).push(t);
    }
    return map;
  }, [tables]);

  const stats = useMemo(() => {
    const occupied = tables.filter((t) => t.sessions?.[0]).length;
    return { total: tables.length, occupied, free: tables.length - occupied };
  }, [tables]);

  const activeTableRows = useMemo(() => {
    return tables
      .filter((t) => t.sessions?.[0])
      .map((t) => {
        const session = t.sessions![0];
        const invoice = session.invoices?.[0];
        return {
          tableId: t.id,
          sessionId: session.id,
          label: `${t.area?.name ? `${t.area.name} · ` : ""}Mesa ${t.name}`,
          waiter: session.waiterName ?? waiters.find((w) => w.id === session.waiterId)?.name ?? "Mesero",
          guests: session.guestsCount,
          total: Number(invoice?.total ?? 0),
          inKitchen: invoice?.status === "sent_to_kitchen",
          readyPending: session.kitchenReadyPending || invoice?.kitchenReadyPending,
          openInvoices: session.openInvoiceCount ?? (invoice ? 1 : 0),
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [tables, waiters]);

  useEffect(() => {
    if (activeWaiter?.kind === "staff") setWaiterId(activeWaiter.id);
  }, [activeWaiter]);

  async function openSession(tableId: string) {
    const attribution = toWaiterApiBody(activeWaiter);
    if (!attribution && !waiterId) return alert("Selecciona un mesero o identifícate con PIN");
    try {
      const res = await api.post("/v1/restaurant/table-sessions/open", {
        tableId,
        guestsCount: guests,
        ...(attribution ?? { waiterId }),
      });
      setOpening(null);
      onOpenOrder(res.data.id);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo abrir la mesa");
    }
  }

  function handleTableClick(table: Table) {
    const session = table.sessions?.[0];
    if (session) {
      onOpenOrder(session.id);
    } else {
      setOpening(table.id);
      setGuests(table.capacity || 2);
    }
  }

  function openTransfer(table: Table, e: React.MouseEvent) {
    e.stopPropagation();
    const session = table.sessions?.[0];
    if (!session) return;
    const next = waiters.find((w) => w.id !== session.waiterId);
    setTransferWaiterId(next?.id ?? waiters[0]?.id ?? "");
    setTransferring({ sessionId: session.id, tableName: table.name, currentWaiterId: session.waiterId });
  }

  async function confirmTransfer() {
    if (!transferring || !transferWaiterId) return;
    try {
      await api.post(`/v1/restaurant/table-sessions/${transferring.sessionId}/transfer-waiter`, {
        newWaiterId: transferWaiterId,
      });
      setTransferring(null);
      refresh();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo transferir la mesa");
    }
  }

  async function markTableServed(invoiceId: string, e?: React.MouseEvent) {
    e?.stopPropagation();
    setMarkingServedId(invoiceId);
    try {
      await api.post(`/v1/pos/invoices/${invoiceId}/mark-table-served`);
      setReadyTableAlert(null);
      overdueWarnedRef.current.delete(invoiceId);
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo marcar como servida");
    } finally {
      setMarkingServedId(null);
    }
  }

  async function closeTable(table: Table, e: React.MouseEvent) {
    e.stopPropagation();
    const session = table.sessions?.[0];
    if (!session?.canClose) {
      alert("Hay comandas abiertas. Cobre o anule antes de cerrar la mesa.");
      return;
    }
    if (!window.confirm(`Cerrar mesa ${table.name}? La mesa quedará libre.`)) return;

    setClosingSessionId(session.id);
    try {
      await api.post(`/v1/restaurant/table-sessions/${session.id}/close`);
      dispatchTableUpdated({ tableId: table.id, tableSessionId: session.id, status: "closed" });
      await refresh();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo cerrar la mesa");
    } finally {
      setClosingSessionId(null);
    }
  }

  function waiterName(id?: string) {
    return waiters.find((w) => w.id === id)?.name ?? "Mesero";
  }

  async function createReservation() {
    if (!newReservation.customerName || !newReservation.reservedFor) {
      return alert("Nombre y hora son obligatorios");
    }
    try {
      const res = await api.post("/v1/restaurant/reservations", {
        customerName: newReservation.customerName,
        customerPhone: newReservation.customerPhone || undefined,
        guestsCount: Number(newReservation.guestsCount),
        reservedFor: new Date(newReservation.reservedFor).toISOString(),
        tableId: newReservation.tableId || undefined,
        notes: newReservation.notes || undefined,
      });
      setShowReservation(false);
      setNewReservation({
        customerName: "", customerPhone: "", guestsCount: "2",
        reservedFor: "", tableId: "", notes: "",
      });
      refresh();
      if (res.data?.whatsappLink) {
        if (confirm("Reserva creada. ¿Enviar confirmación formateada por WhatsApp al cliente?")) {
          window.open(res.data.whatsappLink, "_blank");
        }
      } else if (!newReservation.customerPhone) {
        alert("Reserva creada. Agrega celular del cliente para enviar WhatsApp.");
      }
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo crear la reserva");
    }
  }

  async function seatReservation(reservationId: string) {
    if (!waiterId) return alert("Selecciona un mesero");
    try {
      const res = await api.post(`/v1/restaurant/reservations/${reservationId}/seat`, { waiterId });
      if (printSeatingSlipEnabled) {
        await printSeatingSlipTicket(res.data.session.id, reservationId);
      }
      dispatchTableUpdated({
        tableId: res.data.reservation?.table?.id ?? res.data.session.tableId,
        tableSessionId: res.data.session.id,
        status: "opened",
      });
      refresh();
      if (res.data.seatedWhatsAppLink) {
        if (confirm("Cliente sentado. ¿Avisar por WhatsApp que su mesa está lista?")) {
          window.open(res.data.seatedWhatsAppLink, "_blank");
        }
      }
      onOpenOrder(res.data.session.id);
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo sentar la reserva");
    }
  }

  async function cancelReservation(id: string) {
    const reservation = reservations.find((r) => r.id === id);
    const res = await api.patch(`/v1/restaurant/reservations/${id}`, { status: "cancelled" });
    refresh();
    const link = res.data?.cancelWhatsAppLink ?? reservation?.cancelWhatsAppLink;
    if (link && confirm("¿Enviar aviso de cancelación por WhatsApp al cliente?")) {
      window.open(link, "_blank");
    }
  }

  function isReservationSoon(reservedFor: string) {
    const diffMin = (new Date(reservedFor).getTime() - Date.now()) / 60000;
    return diffMin <= remindMinutes && diffMin >= -5;
  }

  const pendingReservations = reservations.filter((r) => r.status === "pending");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Mesas</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--t-muted)" }}>
            {reservationSound ? "🔔 Alerta sonora activa" : "🔕 Alerta sonora desactivada"} · Config
          </span>
          <button
            onClick={refresh}
            style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer", fontSize: 13 }}
          >
            Actualizar
          </button>
          <button
            onClick={() => {
              const now = new Date();
              now.setMinutes(now.getMinutes() + 30 - (now.getMinutes() % 30));
              setNewReservation((r) => ({
                ...r,
                reservedFor: now.toISOString().slice(0, 16),
              }));
              setShowReservation(true);
            }}
            style={{ padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer", fontSize: 13 }}
          >
            + Reserva
          </button>
          <div style={{ display: "flex", gap: 12, fontSize: 14 }}>
            <span style={{ color: "var(--t-green-fg)" }}>● {stats.free} libres</span>
            <span style={{ color: "var(--t-red-fg)" }}>● {stats.occupied} ocupadas</span>
            {pendingReservations.length > 0 && (
              <span style={{ color: "var(--t-link)" }}>📅 {pendingReservations.length} reservas</span>
            )}
          </div>
        </div>
      </div>

      {alertReservationId && (() => {
        const alertReservation = pendingReservations.find((r) => r.id === alertReservationId);
        if (!alertReservation) return null;
        const time = new Date(alertReservation.reservedFor).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
        return (
          <div style={{
            marginBottom: 16,
            padding: "12px 16px",
            borderRadius: 12,
            background: "var(--t-warn-soft)",
            border: "2px solid var(--t-warn-border)",
            color: "var(--t-warn-fg)",
            fontSize: 14,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}>
            <span>
              ⏰ Reserva próxima — <strong>{alertReservation.customerName}</strong>
              {" · "}{alertReservation.guestsCount} pax · {time}
              {alertReservation.table ? ` · Mesa ${alertReservation.table.name}` : ""}
            </span>
            {alertReservation.reminderWhatsAppLink && (
              <a
                href={alertReservation.reminderWhatsAppLink}
                target="_blank"
                rel="noreferrer"
                style={waBtnStyle("#128C7E")}
              >
                WhatsApp recordatorio
              </a>
            )}
          </div>
        );
      })()}

      {readyTableAlert && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--t-success-soft)",
          border: "2px solid var(--t-success-border)",
          color: "var(--t-success-fg)",
          fontWeight: 600,
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}>
          <span>
            🟢 Cocina lista — {readyTableAlert.orderLabel ?? readyTableAlert.tableLabel}
            {readyTableAlert.itemsSummary ? ` · ${readyTableAlert.itemsSummary}` : ""}
            <span style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
              {orderReadyActionLabel(readyTableAlert)}
            </span>
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            {readyTableAlert.tableSessionId && (
              <button
                onClick={() => onOpenOrder(readyTableAlert.tableSessionId!)}
                style={btnSmallPrimary}
              >
                Abrir comanda
              </button>
            )}
            {readyTableAlert.invoiceId && (
              <button
                onClick={() => markTableServed(readyTableAlert.invoiceId!)}
                disabled={markingServedId === readyTableAlert.invoiceId}
                style={btnSmallGhost}
              >
                {markingServedId === readyTableAlert.invoiceId ? "…" : "Marcar servida"}
              </button>
            )}
          </div>
        </div>
      )}

      {overdueAlert.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "var(--t-danger-soft)",
          border: "2px solid #fca5a5",
          color: "#991b1b",
          fontWeight: 600,
          fontSize: 14,
        }}>
          ⚠️ {overdueAlert.length} mesa{overdueAlert.length !== 1 ? "s" : ""} esperando más de {tableReadyWarnMinutes} min sin servir
          <div style={{ marginTop: 6, fontWeight: 500, fontSize: 13 }}>
            {overdueAlert.map((row) => row.tableLabel).join(" · ")}
          </div>
        </div>
      )}

      {readyQueue.length > 0 && (
        <div style={{
          background: "#ecfdf5",
          border: "2px solid #86efac",
          borderRadius: 12,
          padding: 14,
          marginBottom: 20,
        }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14, color: "var(--t-success-fg)" }}>
            Mesas listas — pendientes de servir ({readyQueue.length})
          </h4>
          <div style={{ display: "grid", gap: 8, maxHeight: 220, overflowY: "auto" }}>
            {readyQueue.map((row) => (
              <div
                key={row.invoiceId}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto auto auto auto",
                  gap: 10,
                  alignItems: "center",
                  background: row.isOverdue ? "var(--t-danger-soft)" : "var(--t-card)",
                  border: row.isOverdue ? "1px solid #fca5a5" : "1px solid #bbf7d0",
                  borderRadius: 8,
                  padding: "8px 10px",
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>{row.tableLabel}</strong>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                    {row.waiterName}
                    {row.itemsSummary ? ` · ${row.itemsSummary}` : ""}
                    {" · "}
                    {new Date(row.readyAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    {(row.waitingMinutes ?? 0) > 0 && (
                      <>
                        {" · "}
                        <span style={{ color: row.isOverdue ? "var(--t-danger-fg)" : "var(--t-success-fg)", fontWeight: 600 }}>
                          {row.waitingMinutes} min
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <strong style={{ color: "var(--t-success-fg)" }}>{formatCOP(Number(row.total))}</strong>
                <button onClick={() => onOpenOrder(row.tableSessionId)} style={btnSmallPrimary}>Abrir</button>
                {row.hostWhatsAppLink && (
                  <a
                    href={row.hostWhatsAppLink}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: "6px 12px", borderRadius: 6, border: "none",
                      background: "#25D366", color: "#fff", cursor: "pointer", fontSize: 13,
                      textDecoration: "none",
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
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: "6px 12px", borderRadius: 6, border: "none",
                      background: "#128C7E", color: "#fff", cursor: "pointer", fontSize: 13,
                      textDecoration: "none",
                    }}
                  >
                    WhatsApp mesero
                  </a>
                )}
                <button
                  onClick={(e) => markTableServed(row.invoiceId, e)}
                  disabled={markingServedId === row.invoiceId}
                  style={btnSmallGhost}
                >
                  {markingServedId === row.invoiceId ? "…" : "Servida"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingReservations.length > 0 && (
        <div style={{
          background: "var(--t-accent-soft)", border: "1px solid #bfdbfe", borderRadius: 12,
          padding: 14, marginBottom: 20,
        }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Reservas de hoy</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {pendingReservations.map((r) => (
              <div key={r.id} style={{
                display: "grid", gridTemplateColumns: "1fr auto auto auto auto auto auto", gap: 8,
                alignItems: "center", background: alertReservationId === r.id ? "var(--t-warn-soft)" : "var(--t-card)",
                padding: "10px 12px", borderRadius: 8,
                fontSize: 14,
                border: alertReservationId === r.id ? "1px solid #f59e0b" : "1px solid transparent",
              }}>
                <div>
                  <strong>{r.customerName}</strong>
                  <div style={{ fontSize: 12, color: "var(--t-muted)" }}>
                    {new Date(r.reservedFor).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                    {" · "}{r.guestsCount} pax
                    {r.table
                      ? ` · ${r.table.area?.name ? `${r.table.area.name} · ` : ""}Mesa ${r.table.name}`
                      : ""}
                    {r.customerPhone ? ` · ${r.customerPhone}` : " · sin celular"}
                  </div>
                </div>
                {r.whatsappLink && (
                  <a
                    href={r.whatsappLink}
                    target="_blank"
                    rel="noreferrer"
                    title="Confirmación de reserva"
                    style={waBtnStyle("#25D366")}
                  >
                    Confirmar
                  </a>
                )}
                {r.reminderWhatsAppLink && isReservationSoon(r.reservedFor) && (
                  <a
                    href={r.reminderWhatsAppLink}
                    target="_blank"
                    rel="noreferrer"
                    title="Recordatorio antes de la hora"
                    style={waBtnStyle(alertReservationId === r.id ? "#d97706" : "#128C7E")}
                  >
                    Recordar
                  </a>
                )}
                <button onClick={() => seatReservation(r.id)} style={btnSmallPrimary}>Sentar</button>
                <button onClick={() => cancelReservation(r.id)} style={btnSmallGhost}>Cancelar</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTableRows.length > 0 && (
        <div style={{
          background: "var(--t-danger-soft)", border: "1px solid #fecaca", borderRadius: 12,
          padding: 14, marginBottom: 20,
        }}>
          <h4 style={{ margin: "0 0 10px", fontSize: 14 }}>Mesas activas ({activeTableRows.length})</h4>
          <div style={{ display: "grid", gap: 8, maxHeight: 180, overflowY: "auto" }}>
            {activeTableRows.map((row) => (
              <button
                key={row.sessionId}
                onClick={() => onOpenOrder(row.sessionId)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 10,
                  alignItems: "center",
                  textAlign: "left",
                  background: "var(--t-card)",
                  border: "1px solid #fecaca",
                  borderRadius: 8,
                  padding: "8px 10px",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <div>
                  <strong>{row.label}</strong>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>
                    {row.guests ?? "?"} com · {row.waiter}
                    {row.openInvoices > 1 ? ` · ${row.openInvoices} cuentas` : ""}
                    {row.readyPending ? " · 🟢 Lista" : row.inKitchen ? " · En cocina" : ""}
                  </div>
                </div>
                <strong style={{ color: row.total > 0 ? "var(--t-danger-fg)" : "var(--t-muted)" }}>
                  {formatCOP(row.total)}
                </strong>
                <span style={{ fontSize: 11, color: "var(--t-link)" }}>Abrir →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {Object.entries(grouped).map(([areaName, list]) => (
        <div key={areaName} style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 10px", color: "var(--t-muted)" }}>{areaName}</h4>
          <div className="yall-tables-grid">
            {list.map((t) => {
              const open = t.sessions?.[0];
              const invoice = open?.invoices?.[0];
              const total = Number(invoice?.total ?? 0);
              const readyPending = open?.kitchenReadyPending || invoice?.kitchenReadyPending;
              const isFlashing = flashTable?.tableId === t.id;
              const flashStyle = isFlashing
                ? flashTable?.status === "closed"
                  ? { boxShadow: "0 0 0 3px var(--t-success-border)", transform: "scale(1.02)" }
                  : flashTable?.status === "opened"
                    ? { boxShadow: "0 0 0 3px var(--t-danger-border)", transform: "scale(1.02)" }
                    : { boxShadow: "0 0 0 3px var(--t-accent-border)", transform: "scale(1.02)" }
                : {};
              return (
                <button
                  key={t.id}
                  onClick={() => handleTableClick(t)}
                  className="yall-touch-btn"
                  style={{
                    padding: "14px 10px", borderRadius: 14, border: "2px solid",
                    borderColor: readyPending ? "var(--t-success-border)" : open ? "var(--t-danger-border)" : "var(--t-success-border)",
                    background: readyPending ? "var(--t-success-soft)" : open ? "var(--t-danger-soft)" : "var(--t-success-soft)",
                    color: "var(--t-fg)",
                    cursor: "pointer", textAlign: "center", position: "relative",
                    transition: "box-shadow 0.2s ease, transform 0.2s ease",
                    ...flashStyle,
                  }}
                >
                  {readyPending && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      width: 10, height: 10, borderRadius: "50%",
                      background: "var(--t-green-fg)", boxShadow: "0 0 0 2px var(--t-card)",
                    }} title="Lista en cocina" />
                  )}
                  {open && open.canClose && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => closeTable(t, e)}
                      title="Cerrar mesa"
                      style={{
                        position: "absolute", top: 6, left: 6, fontSize: 10,
                        padding: "2px 6px", borderRadius: 6, background: "var(--t-card)",
                        border: "1px solid var(--t-success-border)", color: "var(--t-success-fg)",
                        opacity: closingSessionId === open.id ? 0.6 : 1,
                      }}
                    >
                      {closingSessionId === open.id ? "…" : "Cerrar"}
                    </span>
                  )}
                  {open && waiters.length > 1 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => openTransfer(t, e)}
                      title="Transferir mesero"
                      style={{
                        position: "absolute", top: 6, right: 6, fontSize: 11,
                        padding: "2px 6px", borderRadius: 6, background: "var(--t-card)",
                        border: "1px solid var(--t-border-strong)", color: "var(--t-muted)",
                      }}
                    >
                      ↔
                    </span>
                  )}
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{t.name}</div>
                  <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 4 }}>
                    {t.capacity}p · {open ? "Ocupada" : "Libre"}
                  </div>
                  {open && (
                    <>
                      <div style={{ fontSize: 11, marginTop: 4, color: "var(--t-muted)" }}>
                        {open.guestsCount ?? "?"} com · {waiterName(open.waiterId)}
                      </div>
                      {total > 0 && (
                        <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: "var(--t-danger-fg)" }}>
                          {formatCOP(total)}
                        </div>
                      )}
                      {invoice?.status === "sent_to_kitchen" && (
                        <div style={{ fontSize: 10, marginTop: 2, color: "var(--t-orange-fg)" }}>En cocina</div>
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {transferring && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 320 }}>
            <h3 style={{ margin: "0 0 8px" }}>Transferir mesa {transferring.tableName}</h3>
            <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)" }}>
              Actual: {waiterName(transferring.currentWaiterId)}
            </p>
            <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
              Nuevo mesero
              <select value={transferWaiterId} onChange={(e) => setTransferWaiterId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}>
                {waiters.filter((w) => w.id !== transferring.currentWaiterId).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setTransferring(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={confirmTransfer} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}>Transferir</button>
            </div>
          </div>
        </div>
      )}

      {showReservation && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 400, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ margin: "0 0 16px" }}>Nueva reserva</h3>
            <label style={labelStyle}>
              Cliente
              <input value={newReservation.customerName} onChange={(e) => setNewReservation({ ...newReservation, customerName: e.target.value })} style={inputStyle} />
            </label>
            <label style={labelStyle}>
              Celular (WhatsApp)
              <input
                value={newReservation.customerPhone}
                placeholder="3001234567"
                onChange={(e) => setNewReservation({ ...newReservation, customerPhone: e.target.value })}
                style={inputStyle}
              />
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label style={labelStyle}>
                Comensales
                <input type="number" value={newReservation.guestsCount} onChange={(e) => setNewReservation({ ...newReservation, guestsCount: e.target.value })} style={inputStyle} />
              </label>
              <label style={labelStyle}>
                Hora
                <input type="datetime-local" value={newReservation.reservedFor} onChange={(e) => setNewReservation({ ...newReservation, reservedFor: e.target.value })} style={inputStyle} />
              </label>
            </div>
            <label style={labelStyle}>
              Mesa (opcional)
              <select value={newReservation.tableId} onChange={(e) => setNewReservation({ ...newReservation, tableId: e.target.value })} style={inputStyle}>
                <option value="">Sin asignar</option>
                {tables.map((t) => (
                  <option key={t.id} value={t.id}>{t.area?.name} · Mesa {t.name} ({t.capacity}p)</option>
                ))}
              </select>
            </label>
            <label style={labelStyle}>
              Notas
              <input value={newReservation.notes} onChange={(e) => setNewReservation({ ...newReservation, notes: e.target.value })} style={inputStyle} />
            </label>

            {(waPreviewLoading || waPreview) && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Vista previa WhatsApp</span>
                  {waPreviewLoading && <span>Actualizando…</span>}
                </div>
                {waPreview && (
                  <>
                    <WhatsAppMessagePreview message={waPreview.message} />
                    {!waPreview.hasPhone && (
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309" }}>
                        Agrega celular para habilitar el envío.
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={() => setShowReservation(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={createReservation} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {opening && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50,
        }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 320 }}>
            <h3 style={{ margin: "0 0 16px" }}>Abrir mesa</h3>
            <label style={{ display: "grid", gap: 6, fontSize: 14, marginBottom: 12 }}>
              Comensales
              <input type="number" value={guests} onChange={(e) => setGuests(Number(e.target.value))} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)" }} />
            </label>
            {activeWaiter ? (
              <p style={{ fontSize: 14, color: "var(--t-muted)", margin: "0 0 12px" }}>
                Mesero: <strong>{activeWaiter.name}</strong>
              </p>
            ) : (
              <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
                Mesero
                <select value={waiterId} onChange={(e) => setWaiterId(e.target.value)} style={{ padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)" }}>
                  {waiters.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </label>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setOpening(null)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={() => openSession(opening)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" }}>Abrir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 6, fontSize: 14, marginBottom: 10 };
const inputStyle: React.CSSProperties = { padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-input-bg)", color: "var(--t-input-fg)" };
const btnSmallPrimary: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "none", background: "var(--t-green-fg)", color: "var(--t-primary-fg)", cursor: "pointer", fontSize: 13 };
const btnSmallGhost: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)", cursor: "pointer", fontSize: 13 };

function waBtnStyle(background: string): React.CSSProperties {
  return {
    padding: "6px 10px",
    borderRadius: 6,
    border: "none",
    background,
    color: "#fff",
    cursor: "pointer",
    fontSize: 12,
    textDecoration: "none",
    textAlign: "center",
    whiteSpace: "nowrap",
  };
}

function WhatsAppMessagePreview({ message }: { message: string }) {
  return (
    <div style={{
      background: "var(--t-wa-bg)",
      borderRadius: 12,
      padding: 12,
      border: "1px solid var(--t-wa-border)",
    }}>
      <div style={{
        background: "var(--t-card)",
        borderRadius: 10,
        padding: "10px 12px",
        fontSize: 13,
        lineHeight: 1.45,
        color: "var(--t-wa-bubble-fg)",
        boxShadow: "0 1px 1px rgba(0,0,0,0.08)",
        maxWidth: "100%",
      }}>
        {message.split("\n").map((line, index) => (
          <div key={index} style={{ minHeight: line ? undefined : 8 }}>
            {line ? formatWhatsAppLine(line) : null}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 10, color: "var(--t-wa-meta)", marginTop: 6, textAlign: "right" }}>
        Vista previa · formato WhatsApp
      </div>
    </div>
  );
}

function formatWhatsAppLine(line: string) {
  const parts = line.split(/(\*[^*]+\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <strong key={index}>{part.slice(1, -1)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function playTableReadyTone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    for (const [index, freq] of [523, 659, 784, 988].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.14, now + index * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.15 + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.15);
      osc.stop(now + index * 0.15 + 0.12);
    }
    window.setTimeout(() => void ctx.close(), 1000);
  } catch {
    // ignorar
  }
}

function playReservationTone() {
  try {
    const AudioCtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    for (const [index, freq] of [659, 784, 988].entries()) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.22 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.22 + 0.18);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + index * 0.22);
      osc.stop(now + index * 0.22 + 0.18);
    }

    window.setTimeout(() => void ctx.close(), 1200);
  } catch {
    // Ignorar si el navegador bloquea audio sin interacción previa.
  }
}
