import { useEffect, useMemo, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { createKdsSocket } from "../lib/kdsSocket";

type KdsItem = {
  id: string;
  status: string;
  invoiceId: string;
  productName: string;
  qty: number;
  lineNotes?: string;
  tableName?: string;
  areaName?: string;
  elapsedMin: number;
  course?: string;
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
  const [voidAlert, setVoidAlert] = useState<{ label: string; reason?: string | null } | null>(null);

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
    return () => { socket.disconnect(); };
  }, [branchId, stationId]);

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
    new: items.filter((i) => i.status === "new"),
    preparing: items.filter((i) => i.status === "preparing"),
    ready: items.filter((i) => i.status === "ready"),
  }), [items]);

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
          ⛔ PEDIDO ANULADO — {voidAlert.label}
          {voidAlert.reason ? ` · ${voidAlert.reason}` : ""}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: "#fff" }}>🍳 Cocina — Restaurante de Yall</h2>
          <div style={{ fontSize: 14, color: "var(--t-muted)" }}>
            {clock.toLocaleTimeString("es-CO")} · {items.length} pedidos activos
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
              {col === "new" ? "Nuevo" : col === "preparing" ? "Preparando" : "Listo"} ({grouped[col].length})
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {grouped[col].map((item) => (
                <KdsCard key={item.id} item={item} onStatus={setStatus} onNotify={notifyCustomer} />
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

function KdsCard({
  item,
  onStatus,
  onNotify,
}: {
  item: KdsItem;
  onStatus: (id: string, s: string) => void;
  onNotify: (invoiceId: string) => void;
}) {
  const urgent = item.elapsedMin >= 15;
  const warning = item.elapsedMin >= 8;

  return (
    <div style={{
      background: "#1e293b", borderRadius: 12, padding: 14,
      border: `2px solid ${urgent ? "#ef4444" : warning ? "#f59e0b" : "#334155"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{ fontWeight: 800, fontSize: 16, color: "#fff" }}>
          {item.tableName ? `Mesa ${item.tableName}` : "Mostrador"}
        </span>
        <span style={{
          fontSize: 12, fontWeight: 700,
          color: urgent ? "#ef4444" : warning ? "#fbbf24" : "#94a3b8",
        }}>
          {item.elapsedMin} min
        </span>
      </div>
      {item.areaName && <div style={{ fontSize: 11, color: "var(--t-muted)", marginBottom: 6 }}>{item.areaName}</div>}
      <div style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 4 }}>
        {item.qty > 1 ? `${item.qty}× ` : ""}{item.productName}
      </div>
      {item.lineNotes && <div style={{ fontSize: 12, color: "#fbbf24" }}>📝 {item.lineNotes}</div>}

      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {item.status === "new" && (
          <ActionBtn color="#3b82f6" onClick={() => onStatus(item.id, "preparing")}>Preparar</ActionBtn>
        )}
        {item.status === "preparing" && (
          <ActionBtn color="#22c55e" onClick={() => onStatus(item.id, "ready")}>Listo</ActionBtn>
        )}
        {item.status === "ready" && (
          <>
            <ActionBtn color="#64748b" onClick={() => onStatus(item.id, "served")}>Entregado</ActionBtn>
            {!item.tableName && (
              <ActionBtn color="#25D366" onClick={() => onNotify(item.invoiceId)}>Avisar</ActionBtn>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ color, onClick, children }: { color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: "none", background: color, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13 }}
    >
      {children}
    </button>
  );
}
