import { useEffect, useMemo, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { createKdsSocket } from "../lib/kdsSocket";
import { formatPickupDisplay, formatPickupLabel, isAutoOrderCode, isPhysicalLocator } from "../lib/pickupCode";

type KdsItem = {
  id: string;
  invoiceLineId: string;
  status: string;
  ticketId: string;
  invoiceId: string;
  productName: string;
  qty: number;
  lineNotes?: string;
  modifiers?: string[];
  tableName?: string | null;
  areaName?: string | null;
  serviceType?: string | null;
  pickupCode?: string | null;
  pickupName?: string | null;
  elapsedMin: number;
  course?: string;
};

type OrderGroup = {
  key: string;
  invoiceId: string;
  ticketId: string;
  label: string;
  subtitle?: string;
  pickupCode?: string | null;
  isCounter: boolean;
  elapsedMin: number;
  items: KdsItem[];
};

const STATUS_COL: Record<string, string> = {
  new: "#fbbf24",
  preparing: "#3b82f6",
  ready: "#22c55e",
};

export default function Kds({ branchId }: { branchId: string }) {
  const [stations, setStations] = useState<{ id: string; name: string }[]>([]);
  const [stationId, setStationId] = useState("");
  const [items, setItems] = useState<KdsItem[]>([]);
  const [clock, setClock] = useState(new Date());
  const [voidAlert, setVoidAlert] = useState<{ label: string; reason?: string | null; productName?: string } | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [busyLineId, setBusyLineId] = useState<string | null>(null);

  useEffect(() => {
    setBranchId(branchId);
    api.get("/v1/kds/stations").then((s) => {
      setStations(s.data);
      if (s.data[0]?.id) setStationId(s.data[0].id);
    });
  }, [branchId]);

  async function load() {
    if (!stationId) return;
    const r = await api.get("/v1/kds/items", { params: { stationId } });
    setItems(r.data);
  }

  useEffect(() => { load(); }, [stationId]);
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!stationId) return;
    const socket = createKdsSocket(branchId, stationId);
    socket.on("kds.ticket.created", load);
    socket.on("kds.item.updated", load);
    socket.on("kds.invoice.voided", (payload: { label?: string; reason?: string | null }) => {
      setVoidAlert({ label: payload.label ?? "Pedido anulado", reason: payload.reason });
      window.setTimeout(() => setVoidAlert(null), 10000);
      load();
    });
    socket.on("kds.line.voided", (payload: { label?: string; productName?: string; qty?: number }) => {
      const qty = payload.qty ? `${payload.qty}× ` : "";
      setVoidAlert({
        label: payload.label ?? "Pedido",
        productName: `${qty}${payload.productName ?? "Producto"}`,
      });
      window.setTimeout(() => setVoidAlert(null), 10000);
      load();
    });
    return () => { socket.disconnect(); };
  }, [branchId, stationId]);

  async function voidLineFromKitchen(item: KdsItem) {
    const label = item.qty > 1 ? `${item.qty}× ${item.productName}` : item.productName;
    if (!window.confirm(`¿Anular "${label}" de la comanda?`)) return;
    setBusyLineId(item.invoiceLineId);
    try {
      await api.post(`/v1/pos/invoices/${item.invoiceId}/lines/${item.invoiceLineId}/void-from-kitchen`);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo anular el producto");
    } finally {
      setBusyLineId(null);
    }
  }

  async function setStatus(itemId: string, status: string) {
    const res = await api.post(`/v1/kds/items/${itemId}/status/${status}`);
    const notify = res.data?.pickupNotify;
    if (notify?.notified) {
      if (notify.whatsappLink && confirm("Pedido listo. ¿Abrir WhatsApp para avisar al cliente?")) {
        window.open(notify.whatsappLink, "_blank");
      } else if (notify.smsLink && confirm("Pedido listo. ¿Abrir SMS para avisar al cliente?")) {
        window.open(notify.smsLink, "_blank");
      }
    }
    await load();
  }

  async function setOrderStatus(group: OrderGroup, status: string) {
    setBusyOrderId(group.invoiceId);
    try {
      let res;
      if (status === "preparing") {
        res = await api.post(`/v1/kds/invoices/${group.invoiceId}/mark-preparing`);
      } else if (status === "ready") {
        res = await api.post(`/v1/kds/invoices/${group.invoiceId}/mark-ready`);
      } else if (status === "served") {
        res = await api.post(`/v1/kds/invoices/${group.invoiceId}/mark-served`);
      } else {
        return;
      }
      const notify = res.data?.pickupNotify;
      if (notify?.notified) {
        if (notify.whatsappLink && confirm("Pedido listo. ¿Abrir WhatsApp para avisar al cliente?")) {
          window.open(notify.whatsappLink, "_blank");
        } else if (notify.smsLink && confirm("Pedido listo. ¿Abrir SMS para avisar al cliente?")) {
          window.open(notify.smsLink, "_blank");
        }
      }
      await load();
    } finally {
      setBusyOrderId(null);
    }
  }

  async function notifyCustomer(invoiceId: string) {
    const res = await api.post(`/v1/pos/invoices/${invoiceId}/pickup-notify`);
    const notify = res.data;
    if (!notify.whatsappLink && !notify.smsLink) {
      alert("Sin teléfono de cliente o pedido aún no está listo");
      return;
    }
    const useWa = notify.whatsappLink && confirm("¿Avisar por WhatsApp?");
    if (useWa && notify.whatsappLink) {
      window.open(notify.whatsappLink, "_blank");
      return;
    }
    if (notify.smsLink) window.open(notify.smsLink, "_blank");
  }

  const grouped = useMemo(() => ({
    new: groupItemsByOrder(items.filter((i) => i.status === "new")),
    preparing: groupItemsByOrder(items.filter((i) => i.status === "preparing")),
    ready: groupItemsByOrder(items.filter((i) => i.status === "ready")),
  }), [items]);

  const orderCount = useMemo(
    () => new Set(items.map((i) => i.invoiceId)).size,
    [items],
  );

  return (
    <div style={{ background: "#0f172a", color: "#e2e8f0", margin: -20, padding: 20, minHeight: "calc(100vh - 60px)" }}>
      {voidAlert && (
        <div style={{
          marginBottom: 16,
          padding: "12px 16px",
          borderRadius: 12,
          background: "#7f1d1d",
          border: "2px solid #fca5a5",
          color: "#fff",
          fontWeight: 700,
        }}>
          ⛔ {voidAlert.productName ? "PRODUCTO ANULADO" : "PEDIDO ANULADO"} — {voidAlert.label}
          {voidAlert.productName ? ` · ${voidAlert.productName}` : ""}
          {voidAlert.reason ? ` · ${voidAlert.reason}` : ""}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff" }}>🍳 Cocina — Restaurante de Yall</h2>
          <div style={{ fontSize: 14, color: "var(--t-muted)" }}>
            {clock.toLocaleTimeString("es-CO")} · {orderCount} pedido(s) · {items.length} producto(s)
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {stations.map((s) => (
            <button
              key={s.id}
              onClick={() => setStationId(s.id)}
              style={{
                padding: "8px 16px", borderRadius: 8, border: "none", cursor: "pointer",
                background: stationId === s.id ? "#2563eb" : "#1e293b",
                color: "#fff", fontWeight: stationId === s.id ? 700 : 400,
              }}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        {(["new", "preparing", "ready"] as const).map((col) => (
          <div key={col}>
            <div style={{
              padding: "8px 12px", borderRadius: 8, marginBottom: 10, fontWeight: 700,
              background: STATUS_COL[col], color: col === "new" ? "#000" : "#fff",
              textAlign: "center", textTransform: "uppercase", fontSize: 13,
            }}>
              {col === "new" ? "Nuevo" : col === "preparing" ? "Preparando" : "Listo"} ({grouped[col].length} pedidos)
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              {grouped[col].map((group) => (
                <KdsOrderCard
                  key={`${col}-${group.key}`}
                  group={group}
                  column={col}
                  busy={busyOrderId === group.invoiceId}
                  busyLineId={busyLineId}
                  onOrderStatus={setOrderStatus}
                  onNotify={notifyCustomer}
                  onVoidLine={voidLineFromKitchen}
                />
              ))}
              {grouped[col].length === 0 && (
                <div style={{ textAlign: "center", color: "var(--t-muted)", padding: 20, fontSize: 13 }}>—</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupItemsByOrder(items: KdsItem[]): OrderGroup[] {
  const map = new Map<string, OrderGroup>();

  for (const item of items) {
    const existing = map.get(item.invoiceId);
    if (existing) {
      existing.items.push(item);
      existing.elapsedMin = Math.max(existing.elapsedMin, item.elapsedMin);
      continue;
    }

    map.set(item.invoiceId, {
      key: item.invoiceId,
      invoiceId: item.invoiceId,
      ticketId: item.ticketId,
      label: buildOrderLabel(item),
      subtitle: buildOrderSubtitle(item),
      pickupCode: item.pickupCode,
      isCounter: !item.tableName,
      elapsedMin: item.elapsedMin,
      items: [item],
    });
  }

  return [...map.values()].sort((a, b) => a.elapsedMin - b.elapsedMin);
}

function buildOrderLabel(item: KdsItem) {
  if (item.tableName) {
    return `Mesa ${item.tableName}`;
  }
  if (item.pickupCode) {
    return formatPickupLabel(item.pickupCode);
  }
  if (item.serviceType === "takeaway") return "Para llevar";
  if (item.serviceType === "delivery") return "Domicilio";
  return "Mostrador";
}

function buildOrderSubtitle(item: KdsItem) {
  const parts: string[] = [];
  if (item.pickupName) parts.push(item.pickupName);
  if (item.areaName) parts.push(item.areaName);
  if (item.tableName && item.pickupCode && isPhysicalLocator(item.pickupCode)) {
    parts.push(formatPickupDisplay(item.pickupCode));
  }
  return parts.join(" · ") || undefined;
}

function KdsOrderCard({
  group,
  column,
  busy,
  busyLineId,
  onOrderStatus,
  onNotify,
  onVoidLine,
}: {
  group: OrderGroup;
  column: "new" | "preparing" | "ready";
  busy: boolean;
  busyLineId: string | null;
  onOrderStatus: (group: OrderGroup, status: string) => void;
  onNotify: (invoiceId: string) => void;
  onVoidLine: (item: KdsItem) => void;
}) {
  const urgent = group.elapsedMin >= 15;
  const warning = group.elapsedMin >= 8;

  return (
    <div style={{
      background: "#1e293b",
      borderRadius: 14,
      padding: 14,
      border: `2px solid ${urgent ? "#ef4444" : warning ? "#f59e0b" : group.pickupCode ? "#2563eb" : "#334155"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 900, fontSize: 20, color: "#fff", lineHeight: 1.1 }}>
            {group.label}
          </div>
          {group.subtitle && (
            <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 4 }}>{group.subtitle}</div>
          )}
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            {group.items.length} producto(s) en esta etapa
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          {group.pickupCode && (
            <div style={{
              fontSize: isAutoOrderCode(group.pickupCode) ? 24 : 28,
              fontWeight: 900,
              color: isPhysicalLocator(group.pickupCode) ? "#60a5fa" : "#fbbf24",
              lineHeight: 1,
            }}>
              {formatPickupDisplay(group.pickupCode)}
            </div>
          )}
          <div style={{
            fontSize: 12,
            fontWeight: 700,
            color: urgent ? "#ef4444" : warning ? "#fbbf24" : "#94a3b8",
            marginTop: 4,
          }}>
            {group.elapsedMin} min
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, marginBottom: 12 }}>
        {group.items.map((item) => (
          <div
            key={item.id}
            style={{
              background: "#0f172a",
              borderRadius: 10,
              padding: "10px 12px",
              border: "1px solid #334155",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#f8fafc" }}>
                  {item.qty > 1 ? `${item.qty}× ` : ""}{item.productName}
                </div>
                {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                  <div style={{ fontSize: 12, color: "#cbd5e1", marginTop: 4 }}>
                    + {item.modifiers.join(" · ")}
                  </div>
                )}
                {item.lineNotes && <div style={{ fontSize: 12, color: "#fbbf24", marginTop: 4 }}>📝 {item.lineNotes}</div>}
                {item.course && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>{item.course}</div>}
              </div>
              <button
                type="button"
                onClick={() => onVoidLine(item)}
                disabled={busyLineId === item.invoiceLineId}
                style={{
                  flexShrink: 0,
                  padding: "4px 8px",
                  borderRadius: 8,
                  border: "1px solid #7f1d1d",
                  background: "#450a0a",
                  color: "#fca5a5",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: busyLineId === item.invoiceLineId ? "wait" : "pointer",
                  opacity: busyLineId === item.invoiceLineId ? 0.6 : 1,
                }}
              >
                {busyLineId === item.invoiceLineId ? "…" : "Anular"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {column === "new" && (
          <>
            <ActionBtn color="#3b82f6" disabled={busy} onClick={() => onOrderStatus(group, "preparing")}>
              {busy ? "…" : "Preparar pedido"}
            </ActionBtn>
            <ActionBtn color="#22c55e" disabled={busy} onClick={() => onOrderStatus(group, "ready")}>
              {busy ? "…" : "Pedido listo"}
            </ActionBtn>
          </>
        )}
        {column === "preparing" && (
          <ActionBtn color="#22c55e" disabled={busy} onClick={() => onOrderStatus(group, "ready")}>
            {busy ? "…" : "Pedido listo"}
          </ActionBtn>
        )}
        {column === "ready" && (
          <>
            <ActionBtn color="#64748b" disabled={busy} onClick={() => onOrderStatus(group, "served")}>
              {busy ? "…" : "Entregar pedido"}
            </ActionBtn>
            {group.isCounter && (
              <ActionBtn color="#25D366" disabled={busy} onClick={() => onNotify(group.invoiceId)}>
                Avisar
              </ActionBtn>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({
  color,
  onClick,
  disabled,
  children,
}: {
  color: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        minWidth: 120,
        padding: "8px 0",
        borderRadius: 8,
        border: "none",
        background: color,
        color: "#fff",
        fontWeight: 700,
        cursor: disabled ? "wait" : "pointer",
        fontSize: 13,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}
