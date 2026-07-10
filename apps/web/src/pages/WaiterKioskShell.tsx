import { useEffect, useState } from "react";
import { setBranchId, api } from "../lib/api";
import { type AuthUser } from "../lib/auth";
import { exitWaiterKiosk, isWaiterUser } from "../lib/waiterKiosk";
import { useSwipeTabs } from "../lib/useSwipeTabs";
import { verifyPin } from "../lib/pin";
import { clearActiveWaiter, getActiveWaiter, setActiveWaiter } from "../lib/activeWaiter";
import { createBranchSocket, TABLE_READY_EVENT, TABLE_SERVED_EVENT, type TableReadyDetail } from "../lib/kdsSocket";
import {
  matchesOrderWaiter,
  notifyKitchenReadyBrowser,
  orderReadyActionLabel,
  playKitchenReadyTone,
  queueRowToReadyDetail,
  resolveWaiterIdentity,
} from "../lib/kitchenReady";
import PinPromptModal from "../components/PinPromptModal";
import { useTheme } from "../lib/theme";
import Tables from "./Tables";
import Order from "./Order";

type Tab = "tables" | "order";
type PinAction = "exit" | "logout" | "identify" | null;

export default function WaiterKioskShell({
  branchId,
  branchName,
  companyBrand,
  user,
  onLogout,
}: {
  branchId: string;
  branchName?: string;
  companyBrand?: string;
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
  const [kitchenAlerts, setKitchenAlerts] = useState<TableReadyDetail[]>([]);
  const [markingServedId, setMarkingServedId] = useState<string | null>(null);
  const { dark, toggleDark } = useTheme();
  const waiterIdentity = resolveWaiterIdentity(activeWaiter, user);

  useEffect(() => {
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, []);

  function acceptReadyAlert(detail: TableReadyDetail, playSound = true) {
    if (!detail.invoiceId) return;
    if (!matchesOrderWaiter(detail, waiterIdentity)) return;
    setKitchenAlerts((prev) => {
      if (prev.some((a) => a.invoiceId === detail.invoiceId)) return prev;
      return [detail, ...prev].slice(0, 8);
    });
    if (playSound) {
      playKitchenReadyTone();
      notifyKitchenReadyBrowser(detail);
    }
  }

  useEffect(() => {
    if (!branchId) return;
    const socket = createBranchSocket(branchId);
    socket.on("kds.table.ready", (payload: TableReadyDetail) => {
      acceptReadyAlert(payload);
    });
    socket.on("kds.table.served", (payload: { invoiceId?: string }) => {
      if (!payload?.invoiceId) return;
      setKitchenAlerts((prev) => prev.filter((a) => a.invoiceId !== payload.invoiceId));
    });
    return () => { socket.disconnect(); };
  }, [branchId, waiterIdentity?.id, waiterIdentity?.kind]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const detail = (event as CustomEvent<TableReadyDetail>).detail;
      if (!detail?.invoiceId) return;
      acceptReadyAlert(detail);
    };
    const onServed = (event: Event) => {
      const detail = (event as CustomEvent<{ invoiceId?: string }>).detail;
      if (!detail?.invoiceId) return;
      setKitchenAlerts((prev) => prev.filter((a) => a.invoiceId !== detail.invoiceId));
    };
    window.addEventListener(TABLE_READY_EVENT, onReady);
    window.addEventListener(TABLE_SERVED_EVENT, onServed);
    return () => {
      window.removeEventListener(TABLE_READY_EVENT, onReady);
      window.removeEventListener(TABLE_SERVED_EVENT, onServed);
    };
  }, [waiterIdentity?.id, waiterIdentity?.kind]);

  useEffect(() => {
    if (!waiterIdentity) {
      setKitchenAlerts([]);
      return;
    }
    let cancelled = false;
    async function pollReadyQueue() {
      try {
        const res = await api.get("/v1/pos/table-ready-queue");
        if (cancelled) return;
        const mine = (res.data as Array<Parameters<typeof queueRowToReadyDetail>[0]>)
          .map(queueRowToReadyDetail)
          .filter((detail) => matchesOrderWaiter(detail, waiterIdentity));
        if (mine.length === 0) return;
        setKitchenAlerts((prev) => {
          const merged = [...mine];
          for (const alert of prev) {
            if (!merged.some((a) => a.invoiceId === alert.invoiceId)) merged.push(alert);
          }
          return merged.slice(0, 8);
        });
      } catch {
        // ignore polling errors
      }
    }
    void pollReadyQueue();
    const timer = window.setInterval(pollReadyQueue, 5_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [waiterIdentity?.id, waiterIdentity?.kind]);

  async function markOrderServed(invoiceId: string, serviceType?: string) {
    setMarkingServedId(invoiceId);
    try {
      if (serviceType === "dine_in" || !serviceType) {
        await api.post(`/v1/pos/invoices/${invoiceId}/mark-table-served`);
      } else {
        await api.post(`/v1/pos/invoices/${invoiceId}/pickup-delivered`);
      }
      setKitchenAlerts((prev) => prev.filter((a) => a.invoiceId !== invoiceId));
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      alert(typeof msg === "string" ? msg : "No se pudo marcar como servido");
    } finally {
      setMarkingServedId(null);
    }
  }

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
    <div className="yall-kiosk-shell" style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      background: "var(--t-subtle)",
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      <header className="yall-kiosk-header">
        <div className="yall-kiosk-header__brand">
          <div className="yall-kiosk-header__title">
            {companyBrand || "YallPos"}
          </div>
          <div className="yall-kiosk-header__subtitle">
            {companyBrand ? "YallPos · Mesero" : "Mesero"} · {branchName ?? "Restaurante"} · {waiterLabel}
          </div>
        </div>
        <div className="yall-kiosk-header__actions">
          <button
            type="button"
            onClick={toggleDark}
            className="yall-kiosk-header__btn yall-kiosk-header__btn--theme"
            title={dark ? "Modo claro" : "Modo oscuro"}
            aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}
          >
            <span className="yall-kiosk-header__theme-icon" aria-hidden>{dark ? "☀️" : "🌙"}</span>
            <span className="yall-kiosk-header__theme-label">{dark ? "Claro" : "Oscuro"}</span>
          </button>
          <button
            type="button"
            onClick={() => { setPinError(null); setPinAction("identify"); }}
            className="yall-touch-btn yall-kiosk-header__btn"
            title="Identificar mesero con PIN"
          >
            Cambiar
          </button>
          {!isWaiterUser(user) && (
            <button
              type="button"
              onClick={() => { setPinError(null); setPinAction("exit"); }}
              className="yall-touch-btn yall-kiosk-header__btn yall-kiosk-header__btn--hide-narrow"
              title="Salir del modo mesero"
            >
              Modo completo
            </button>
          )}
          <button
            type="button"
            onClick={() => { setPinError(null); setPinAction("logout"); }}
            className="yall-touch-btn yall-kiosk-header__btn"
            title="Cerrar sesión"
          >
            Salir
          </button>
        </div>
      </header>

      {!waiterIdentity && (
        <div className="yall-kiosk-identify">
          <span>Identifícate con tu PIN de mesero para registrar comandas. Los avisos de cocina usan tu sesión de mesero.</span>
          <button type="button" onClick={() => setPinAction("identify")}>Ingresar PIN</button>
        </div>
      )}

      {kitchenAlerts.length > 0 && (
        <div style={{ padding: "12px 16px 0", display: "grid", gap: 10 }}>
          {kitchenAlerts.map((alert) => (
            <div
              key={alert.invoiceId}
              style={{
                padding: "12px 16px",
                borderRadius: 12,
                background: "#dcfce7",
                border: "2px solid #22c55e",
                color: "#14532d",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <span>
                🟢 Cocina lista — {alert.orderLabel ?? alert.tableLabel}
                {alert.itemsSummary ? ` · ${alert.itemsSummary}` : ""}
                <span style={{ display: "block", fontSize: 12, fontWeight: 500, marginTop: 4 }}>
                  {orderReadyActionLabel(alert)}
                </span>
              </span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {alert.tableSessionId && (
                  <button
                    type="button"
                    onClick={() => openOrder(alert.tableSessionId!)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "none",
                      background: "#2563eb",
                      color: "#fff",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    Abrir comanda
                  </button>
                )}
                {alert.waiterWhatsAppLink && (
                  <a
                    href={alert.waiterWhatsAppLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      background: "#128C7E",
                      color: "#fff",
                      textDecoration: "none",
                      fontWeight: 700,
                    }}
                  >
                    WhatsApp
                  </a>
                )}
                {alert.invoiceId && (
                  <button
                    type="button"
                    onClick={() => markOrderServed(alert.invoiceId!, alert.serviceType)}
                    disabled={markingServedId === alert.invoiceId}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      border: "1px solid #86efac",
                      background: "#fff",
                      color: "#14532d",
                      cursor: "pointer",
                      fontWeight: 700,
                    }}
                  >
                    {markingServedId === alert.invoiceId
                      ? "…"
                      : alert.actionHint === "pickup" ? "Retirado" : "Servido"}
                  </button>
                )}
              </div>
            </div>
          ))}
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

const primaryBtn: React.CSSProperties = {
  padding: "12px 20px",
  borderRadius: 10,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontWeight: 600,
};
