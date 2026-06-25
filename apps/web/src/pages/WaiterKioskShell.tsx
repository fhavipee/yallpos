import { useEffect, useState } from "react";
import { setBranchId } from "../lib/api";
import { type AuthUser } from "../lib/auth";
import { exitWaiterKiosk, isWaiterUser } from "../lib/waiterKiosk";
import { useSwipeTabs } from "../lib/useSwipeTabs";
import { verifyPin } from "../lib/pin";
import { clearActiveWaiter, getActiveWaiter, setActiveWaiter } from "../lib/activeWaiter";
import PinPromptModal from "../components/PinPromptModal";
import Tables from "./Tables";
import Order from "./Order";

type Tab = "tables" | "order";
type PinAction = "exit" | "logout" | "identify" | null;

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
  const [activeWaiter, setActiveWaiterState] = useState(() => getActiveWaiter());
  const [pinAction, setPinAction] = useState<PinAction>(null);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    setBranchId(branchId);
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

  async function submitPin(pin: string) {
    setPinBusy(true);
    setPinError(null);
    try {
      if (pinAction === "identify") {
        const identity = await verifyPin(pin, "waiter");
        if (!identity) {
          setPinError("PIN de mesero incorrecto");
          return;
        }
        setActiveWaiter(identity);
        setActiveWaiterState(identity);
        setPinAction(null);
        return;
      }

      await verifyPin(pin, "admin");
      if (pinAction === "exit") {
        clearActiveWaiter();
        exitWaiterKiosk();
      } else if (pinAction === "logout") {
        clearActiveWaiter();
        onLogout();
      }
      setPinAction(null);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setPinError(typeof msg === "string" ? msg : "PIN incorrecto");
    } finally {
      setPinBusy(false);
    }
  }

  const swipeRef = useSwipeTabs(
    ["tables", "order"] as const,
    tab,
    (next) => {
      if (next === "order" && !tableSessionId) {
        alert("Primero abre una mesa");
        return;
      }
      setTab(next);
    },
    { enabled: true },
  );

  const waiterLabel = activeWaiter?.name ?? user.name;

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
            {branchName ?? "Restaurante"} · {waiterLabel}
          </div>
        </div>
        <button
          type="button"
          onClick={() => { setPinError(null); setPinAction("identify"); }}
          className="yall-touch-btn"
          style={headerBtn}
          title="Identificar mesero con PIN"
        >
          Cambiar
        </button>
        {!isWaiterUser(user) && (
          <button
            type="button"
            onClick={() => { setPinError(null); setPinAction("exit"); }}
            className="yall-touch-btn"
            style={headerBtn}
            title="Salir del modo mesero"
          >
            Modo completo
          </button>
        )}
        <button
          type="button"
          onClick={() => { setPinError(null); setPinAction("logout"); }}
          className="yall-touch-btn"
          style={headerBtn}
          title="Cerrar sesión"
        >
          Salir
        </button>
      </header>

      {!activeWaiter && (
        <div className="yall-kiosk-identify">
          <span>Identifícate con tu PIN de mesero para registrar propinas y comandas.</span>
          <button type="button" onClick={() => setPinAction("identify")}>Ingresar PIN</button>
        </div>
      )}

      <main
        ref={swipeRef}
        className="yall-app-main--swipe"
        style={{ flex: 1, padding: "12px 12px 88px", maxWidth: 900, width: "100%", margin: "0 auto", boxSizing: "border-box" }}
      >
        <p className="yall-swipe-hint yall-hide-desktop">Desliza ← → entre Mesas y Comanda</p>
        {tab === "tables" && (
          <Tables branchId={branchId} active onOpenOrder={openOrder} activeWaiter={activeWaiter} />
        )}
        {tab === "order" && (
          tableSessionId ? (
            <Order
              branchId={branchId}
              tableSessionId={tableSessionId}
              onPaid={closeOrder}
              activeWaiter={activeWaiter}
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

      <nav className="yall-app-bottom-nav yall-app-bottom-nav--kiosk" aria-label="Mesero">
        <KioskTab active={tab === "tables"} onClick={() => setTab("tables")} icon="🪑" label="Mesas" />
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

      <PinPromptModal
        open={pinAction !== null}
        title={
          pinAction === "identify"
            ? "PIN de mesero"
            : "PIN de administrador"
        }
        description={
          pinAction === "identify"
            ? "Ingresa tu PIN personal asignado en Admin."
            : "Solo gerencia puede salir del modo mesero o cerrar la sesión del quiosco."
        }
        confirmLabel={pinAction === "identify" ? "Identificarme" : "Confirmar"}
        onCancel={() => { setPinAction(null); setPinError(null); }}
        onSubmit={submitPin}
        error={pinError}
        busy={pinBusy}
      />
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
      className={`yall-bottom-tab${active ? " yall-bottom-tab--active" : ""}${dimmed ? " yall-bottom-tab--dimmed" : ""}`}
      onClick={onClick}
    >
      <span className="yall-bottom-tab__icon">{icon}</span>
      <span className="yall-bottom-tab__label">{label}</span>
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
