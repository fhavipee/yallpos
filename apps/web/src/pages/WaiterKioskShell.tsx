import { useEffect, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { type AuthUser } from "../lib/auth";
import { DEFAULT_WAITER_EXIT_PIN, exitWaiterKiosk, isWaiterUser } from "../lib/waiterKiosk";
import Tables from "./Tables";
import Order from "./Order";

type Tab = "tables" | "order";

export default function WaiterKioskShell({
  branchId,
  branchName,
  user,
  onLogout,
}: {
  branchId: string;
  branchName?: string;
  user: AuthUser;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>(() =>
    localStorage.getItem("tableSessionId") ? "order" : "tables",
  );
  const [tableSessionId, setTableSessionId] = useState(
    localStorage.getItem("tableSessionId") || "",
  );
  const [exitPin, setExitPin] = useState(DEFAULT_WAITER_EXIT_PIN);

  useEffect(() => {
    setBranchId(branchId);
    api.get("/v1/settings/branch")
      .then((r) => {
        const pin = r.data?.kiosk?.waiterExitPin;
        if (typeof pin === "string" && pin.trim()) setExitPin(pin.trim());
      })
      .catch(() => {});
  }, [branchId]);

  function openOrder(sessionId: string) {
    localStorage.setItem("tableSessionId", sessionId);
    setTableSessionId(sessionId);
    setTab("order");
  }

  function closeOrder() {
    localStorage.removeItem("tableSessionId");
    setTableSessionId("");
    setTab("tables");
  }

  function tryExitKiosk() {
    const entered = window.prompt("PIN de gerente para salir del modo mesero:");
    if (entered === null) return;
    if (entered.trim() === exitPin) {
      exitWaiterKiosk();
      return;
    }
    alert("PIN incorrecto");
  }

  function tryLogout() {
    const entered = window.prompt("PIN de gerente para cerrar sesión:");
    if (entered === null) return;
    if (entered.trim() === exitPin) {
      onLogout();
      return;
    }
    alert("PIN incorrecto");
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--t-subtle)",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <header style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        background: "#1e3a5f",
        color: "#fff",
        position: "sticky",
        top: 0,
        zIndex: 20,
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>YallPos · Mesero</div>
          <div style={{ fontSize: 12, opacity: 0.85, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {branchName ?? "Restaurante"} · {user.name}
          </div>
        </div>
        {!isWaiterUser(user) && (
          <button
            type="button"
            onClick={tryExitKiosk}
            style={headerBtn}
            title="Salir del modo mesero"
          >
            Modo completo
          </button>
        )}
        <button type="button" onClick={tryLogout} style={headerBtn} title="Cerrar sesión">
          Salir
        </button>
      </header>

      <main style={{ flex: 1, padding: "12px 12px 88px", maxWidth: 900, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {tab === "tables" && (
          <Tables
            branchId={branchId}
            active
            onOpenOrder={openOrder}
          />
        )}
        {tab === "order" && (
          tableSessionId ? (
            <Order
              branchId={branchId}
              tableSessionId={tableSessionId}
              onPaid={closeOrder}
            />
          ) : (
            <div style={{
              textAlign: "center",
              padding: 48,
              background: "var(--t-card)",
              borderRadius: 16,
              border: "1px solid var(--t-border)",
            }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>🍽️</div>
              <p style={{ color: "var(--t-muted)", margin: "0 0 16px" }}>
                Abre una mesa en la pestaña <strong>Mesas</strong> para tomar la comanda.
              </p>
              <button type="button" onClick={() => setTab("tables")} style={primaryBtn}>
                Ir a Mesas
              </button>
            </div>
          )
        )}
      </main>

      <nav style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        padding: "10px 12px calc(10px + env(safe-area-inset-bottom))",
        background: "var(--t-card)",
        borderTop: "1px solid var(--t-border)",
        boxShadow: "0 -4px 20px rgba(0,0,0,0.06)",
      }}>
        <KioskTab
          active={tab === "tables"}
          onClick={() => setTab("tables")}
          icon="🪑"
          label="Mesas"
        />
        <KioskTab
          active={tab === "order"}
          onClick={() => {
            if (!tableSessionId) {
              alert("Primero abre una mesa");
              setTab("tables");
              return;
            }
            setTab("order");
          }}
          icon="📋"
          label="Comanda"
          dimmed={!tableSessionId}
        />
      </nav>
    </div>
  );
}

function KioskTab({
  active,
  onClick,
  icon,
  label,
  dimmed,
}: {
  active: boolean;
  onClick: () => void;
  icon: string;
  label: string;
  dimmed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "14px 12px",
        borderRadius: 14,
        border: active ? "2px solid #2563eb" : "2px solid transparent",
        background: active ? "#eff6ff" : dimmed ? "#f8fafc" : "#f1f5f9",
        color: active ? "#1d4ed8" : dimmed ? "#94a3b8" : "#334155",
        cursor: "pointer",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        fontWeight: active ? 700 : 600,
        fontSize: 15,
      }}
    >
      <span style={{ fontSize: 24 }}>{icon}</span>
      {label}
    </button>
  );
}

const headerBtn: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.35)",
  background: "rgba(255,255,255,0.1)",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
  whiteSpace: "nowrap",
};

const primaryBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
