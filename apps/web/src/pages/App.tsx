import { useEffect, useMemo, useState } from "react";
import { api, clearBranchId, setAuthToken, setBranchId } from "../lib/api";
import { createBranchSocket, dispatchTableUpdated, dispatchTableReady, dispatchTableServed, dispatchLineVoided, dispatchInvoiceUpdated, type TableUpdatedDetail, type TableReadyDetail, type TableServedDetail, type LineVoidedDetail, type InvoiceUpdatedDetail } from "../lib/kdsSocket";
import { clearAuth, getStoredAuth, refreshStoredUser, saveAuth, type AuthUser } from "../lib/auth";
import Login from "./Login";
import Tables from "./Tables";
import Order from "./Order";
import Kds from "./Kds";
import CounterSale from "./CounterSale";
import PickupBoard from "./PickupBoard";
import Onboarding from "./Onboarding";
import Dashboard from "./Dashboard";
import PilotPanel from "./PilotPanel";
import SettingsPage from "./Settings";
import MenuPage from "./Menu";
import HostBoard from "./HostBoard";
import WaiterTraining from "./WaiterTraining";
import WaiterKioskShell from "./WaiterKioskShell";
import AdminConfig from "./AdminConfig";
import MobileBottomNav, {
  APP_TAB_LABELS,
  buildBottomNavItems,
  buildMoreMenuItems,
  type AppTab,
} from "../components/MobileBottomNav";
import MobileMoreSheet from "../components/MobileMoreSheet";
import PwaInstallBanner from "../components/PwaInstallBanner";
import { ensureWaiterKioskUrl, isWaiterUser, shouldUseWaiterKiosk } from "../lib/waiterKiosk";
import { canAccessAdmin, canViewCash, canViewDashboard, canViewFloor, canViewKds, canViewSettings } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { useIsTablet } from "../lib/useMediaQuery";
import { useSwipeTabs } from "../lib/useSwipeTabs";

type Branch = { id: string; name: string; companyId: string; type: string };
type Company = { id: string; name: string; branches: Branch[] };
type Tab = AppTab;

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(() => getStoredAuth()?.user ?? null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [branchId, setBranchIdState] = useState("");
  const [branchReady, setBranchReady] = useState(false);
  const [tableSessionId, setTableSessionId] = useState(localStorage.getItem("tableSessionId") || "");
  const [tab, setTab] = useState<Tab>("counter");
  const [moreOpen, setMoreOpen] = useState(false);
  const [companyBrand, setCompanyBrand] = useState("");
  const { dark, toggleDark } = useTheme();
  const isTablet = useIsTablet();
  const standaloneView = new URLSearchParams(window.location.search).get("view");

  function loadCompanies() {
    clearBranchId();
    setBranchReady(false);
    api.get("/v1/restaurant/companies").then((res) => {
      setCompanies(res.data);
      const allBranches: Branch[] = res.data.flatMap((c: Company) => c.branches);
      if (allBranches.length === 0) {
        setBranchReady(true);
        return;
      }

      const stored = localStorage.getItem("branchId");
      const valid = stored ? allBranches.find((b) => b.id === stored) : undefined;
      const preferred = valid ?? allBranches.find((b) => b.name.includes("Yall")) ?? allBranches[0];

      if (stored && !valid) localStorage.removeItem("branchId");
      setBranchIdState(preferred.id);
      if (!valid) setTab(preferred.type === "restaurant" ? "tables" : "counter");
      setBranchReady(true);
    }).catch(() => {
      setBranchReady(true);
    });
  }

  useEffect(() => {
    const stored = getStoredAuth();
    if (!stored) return;
    clearBranchId();
    setAuthToken(stored.token);
    refreshStoredUser(async () => {
      const r = await api.get("/v1/auth/me");
      return r.data;
    }).then((fresh) => {
      if (fresh) setUser(fresh);
      else setUser(null);
    });
  }, []);

  useEffect(() => {
    if (user) {
      ensureWaiterKioskUrl(user);
      loadCompanies();
    }
  }, [user]);

  useEffect(() => {
    if (tab === "admin" && user && !canAccessAdmin(user)) setTab("counter");
    if (tab === "kds" && user && !canViewKds(user)) setTab("counter");
    if (tab === "dashboard" && user && !canViewDashboard(user)) setTab("counter");
  }, [tab, user]);

  useEffect(() => {
    api.get("/v1/pilot/config").then((r) => {
      const name = r.data?.company?.razonSocial?.trim();
      if (name) {
        setCompanyBrand(name);
        document.title = `YallPos — ${name}`;
      }
    }).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!branchId || !branchReady) return;
    localStorage.setItem("branchId", branchId);
    setBranchId(branchId);
  }, [branchId, branchReady]);

  useEffect(() => {
    if (!branchId) return;
    const socket = createBranchSocket(branchId);
    const onTableUpdated = (payload: TableUpdatedDetail) => dispatchTableUpdated(payload);
    const onTableReady = (payload: TableReadyDetail) => dispatchTableReady(payload);
    const onTableServed = (payload: TableServedDetail) => dispatchTableServed(payload);
    const onLineVoided = (payload: LineVoidedDetail) => dispatchLineVoided(payload);
    const onInvoiceUpdated = (payload: InvoiceUpdatedDetail) => dispatchInvoiceUpdated(payload);
    socket.on("pos.table.updated", onTableUpdated);
    socket.on("kds.table.ready", onTableReady);
    socket.on("kds.table.served", onTableServed);
    socket.on("kds.line.voided", onLineVoided);
    socket.on("pos.invoice.updated", onInvoiceUpdated);
    return () => {
      socket.off("pos.table.updated", onTableUpdated);
      socket.off("kds.table.ready", onTableReady);
      socket.off("kds.table.served", onTableServed);
      socket.off("kds.line.voided", onLineVoided);
      socket.off("pos.invoice.updated", onInvoiceUpdated);
      socket.disconnect();
    };
  }, [branchId]);

  function logout() {
    clearAuth();
    setAuthToken(null);
    clearBranchId();
    localStorage.removeItem("branchId");
    setBranchIdState("");
    setBranchReady(false);
    setUser(null);
  }

  function handleOnboardingComplete(newBranchId: string) {
    setBranchIdState(newBranchId);
    loadCompanies();
    setTab("counter");
  }

  if (!user) {
    return <Login onLogin={(u) => { clearBranchId(); setUser(u); loadCompanies(); }} />;
  }

  const branches = companies.flatMap((c) => c.branches);
  const currentBranch = branches.find((b) => b.id === branchId);
  const currentCompany = companies.find((c) => c.branches.some((b) => b.id === branchId));
  const isRestaurant = currentBranch?.type === "restaurant";

  const restaurantSwipeTabs = useMemo(() => ["tables", "order"] as const, []);
  const swipeEnabled = Boolean(
    branchId && isRestaurant && canViewFloor(user) && (tab === "tables" || tab === "order"),
  );
  const swipeRef = useSwipeTabs(
    restaurantSwipeTabs,
    tab === "order" ? "order" : "tables",
    (next) => {
      if (next === "order" && !tableSessionId) {
        alert("Primero abre una mesa");
        return;
      }
      setTab(next);
    },
    { enabled: swipeEnabled },
  );

  const bottomNavItems = useMemo(
    () => (user ? buildBottomNavItems(user, isRestaurant, !!tableSessionId) : []),
    [user, isRestaurant, tableSessionId],
  );

  const moreItems = useMemo(
    () => (user ? buildMoreMenuItems(user, isRestaurant, bottomNavItems.map((i) => i.id)) : []),
    [user, isRestaurant, bottomNavItems],
  );

  const bg = "var(--t-bg)";
  const fg = "var(--t-fg)";

  if (branchId && standaloneView === "pickup-board") {
    return <PickupBoard branchId={branchId} kiosk />;
  }

  if (user && shouldUseWaiterKiosk(user) && !branchId) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--t-muted)" }}>
        Cargando modo mesero…
      </div>
    );
  }

  if (user && branchId && isRestaurant && shouldUseWaiterKiosk(user)) {
    return (
      <WaiterKioskShell
        branchId={branchId}
        branchName={currentBranch?.name}
        companyBrand={companyBrand}
        user={user}
        onLogout={logout}
      />
    );
  }

  if (user && branchId && shouldUseWaiterKiosk(user) && !isRestaurant) {
    return (
      <div style={{ padding: 40, textAlign: "center", color: "var(--t-muted)" }}>
        El modo mesero solo aplica a sucursales tipo restaurante.
        <div style={{ marginTop: 12 }}>
          <button type="button" onClick={() => { window.location.href = "/"; }} style={{ padding: "8px 16px", borderRadius: 8, cursor: "pointer" }}>
            Volver
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`yall-app-shell${isTablet ? " yall-app-shell--mobile-nav" : ""}`} style={{ fontFamily: "'Inter', system-ui, sans-serif", background: bg, color: fg, minHeight: "100vh" }}>
      <header className={`yall-app-header${isTablet ? " yall-app-header--compact" : ""}`}>
        <div className="yall-app-header-start">
          <div className="yall-app-brand">
            <span className="yall-app-brand__name">{companyBrand || "YallPos"}</span>
            {companyBrand && <span className="yall-app-brand__tag">YallPos</span>}
          </div>
          {isTablet && (
            <span className="yall-app-mobile-tab" aria-current="page">
              {APP_TAB_LABELS[tab]}
            </span>
          )}
        </div>

        <select
          className="yall-app-branch"
          value={branchId}
          aria-label="Sucursal"
          onChange={(e) => {
            const id = e.target.value;
            setBranchIdState(id);
            if (id) {
              localStorage.setItem("branchId", id);
              setBranchId(id);
            } else {
              localStorage.removeItem("branchId");
              clearBranchId();
            }
            const b = branches.find((x) => x.id === id);
            setTab(b?.type === "restaurant" ? "tables" : "counter");
          }}
        >
          <option value="">Sucursal…</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        <nav className="yall-app-nav yall-hide-mobile">
          {(canViewCash(user) || canViewFloor(user)) && (
            <>
              <NavBtn active={tab === "counter"} onClick={() => setTab("counter")} dark={dark}>Mostrador</NavBtn>
              <NavBtn active={tab === "pickup-board"} onClick={() => setTab("pickup-board")} dark={dark}>Retiro</NavBtn>
            </>
          )}
          {isRestaurant && canViewFloor(user) && (
            <>
              <NavBtn active={tab === "tables"} onClick={() => setTab("tables")} dark={dark}>Mesas</NavBtn>
              <NavBtn active={tab === "order"} onClick={() => setTab("order")} dark={dark}>Comanda</NavBtn>
              <NavBtn active={tab === "host"} onClick={() => setTab("host")} dark={dark}>Host</NavBtn>
              {canViewFloor(user) && (
                <>
                  <NavBtn active={tab === "menu"} onClick={() => setTab("menu")} dark={dark}>Menú</NavBtn>
                  <NavBtn active={tab === "training"} onClick={() => setTab("training")} dark={dark}>Capacitación</NavBtn>
                </>
              )}
            </>
          )}
          {canViewKds(user) && (
            <NavBtn active={tab === "kds"} onClick={() => setTab("kds")} dark={dark}>KDS</NavBtn>
          )}
          {canViewDashboard(user) && (
            <NavBtn active={tab === "dashboard"} onClick={() => setTab("dashboard")} dark={dark}>Dashboard</NavBtn>
          )}
          <NavBtn active={tab === "pilot"} onClick={() => setTab("pilot")} dark={dark}>Piloto</NavBtn>
          {canViewSettings(user) && (
            <NavBtn active={tab === "settings"} onClick={() => setTab("settings")} dark={dark}>Config</NavBtn>
          )}
          {canAccessAdmin(user) && (
            <NavBtn active={tab === "admin"} onClick={() => setTab("admin")} dark={dark}>Admin</NavBtn>
          )}
          <NavBtn active={tab === "onboarding"} onClick={() => setTab("onboarding")} dark={dark}>+ Negocio</NavBtn>
        </nav>

        <div className="yall-app-actions">
          <span className="yall-hide-mobile" style={{ fontSize: 13, color: "var(--t-muted)" }}>{user.name}</span>
          <button onClick={toggleDark} className="yall-touch-btn" style={{ ...iconBtn, borderColor: "var(--t-border-strong)", color: "var(--t-fg)" }}>{dark ? "☀️" : "🌙"}</button>
          <button onClick={logout} className="yall-touch-btn" style={{ ...iconBtn, borderColor: "var(--t-border-strong)", color: "var(--t-fg)" }} title="Salir">⎋</button>
        </div>
      </header>

      <main ref={swipeRef} className={`yall-app-main${swipeEnabled ? " yall-app-main--swipe" : ""}`}>
        <PwaInstallBanner />
        {swipeEnabled && (
          <p className="yall-swipe-hint yall-hide-desktop">Desliza ← → entre Mesas y Comanda</p>
        )}
        {!branchId && tab !== "onboarding" && (
          <div style={{ textAlign: "center", padding: 40, color: "var(--t-muted)" }}>
            Selecciona una sucursal o crea un negocio nuevo en <strong>+ Negocio</strong>
          </div>
        )}
        {branchId && tab === "counter" && <CounterSale branchId={branchId} branchType={currentBranch?.type ?? "store"} />}
        {branchId && tab === "pickup-board" && <PickupBoard branchId={branchId} />}
        {branchId && tab === "tables" && (
          <Tables
            branchId={branchId}
            active={tab === "tables"}
            onOpenOrder={(sessionId) => {
              localStorage.setItem("tableSessionId", sessionId);
              setTableSessionId(sessionId);
              setTab("order");
            }}
          />
        )}
        {branchId && tab === "order" && (
          <Order
            branchId={branchId}
            tableSessionId={tableSessionId}
            onPaid={() => {
              localStorage.removeItem("tableSessionId");
              setTableSessionId("");
              setTab("tables");
            }}
          />
        )}
        {branchId && tab === "host" && (
          <HostBoard
            branchId={branchId}
            active={tab === "host"}
            onOpenOrder={(sessionId) => {
              localStorage.setItem("tableSessionId", sessionId);
              setTableSessionId(sessionId);
              setTab("order");
            }}
          />
        )}
        {branchId && tab === "kds" && <Kds branchId={branchId} />}
        {branchId && tab === "menu" && <MenuPage branchId={branchId} />}
        {branchId && tab === "dashboard" && <Dashboard branchId={branchId} />}
        {branchId && tab === "settings" && <SettingsPage branchId={branchId} />}
        {branchId && canAccessAdmin(user) && tab === "admin" && (
          <AdminConfig branchId={branchId} companyId={currentCompany?.id ?? companies[0]?.id} user={user} />
        )}
        {branchId && isRestaurant && tab === "training" && (
          <WaiterTraining branchId={branchId} onOpenTab={(nextTab) => setTab(nextTab as Tab)} />
        )}
        {tab === "pilot" && (
          <PilotPanel
            companyId={currentCompany?.id ?? companies[0]?.id}
            branchId={branchId || undefined}
            onOpenTab={(nextTab) => setTab(nextTab as Tab)}
          />
        )}
        {tab === "onboarding" && <Onboarding onComplete={handleOnboardingComplete} />}
      </main>

      {isTablet && user && (
        <>
          <MobileBottomNav
            tab={tab}
            setTab={setTab}
            user={user}
            isRestaurant={isRestaurant}
            hasTableSession={!!tableSessionId}
            onMore={() => setMoreOpen(true)}
          />
          <MobileMoreSheet
            open={moreOpen}
            onClose={() => setMoreOpen(false)}
            items={moreItems}
            onSelect={setTab}
            userName={user.name}
          />
        </>
      )}
    </div>
  );
}

function NavBtn({ active, onClick, dark, children }: { active: boolean; onClick: () => void; dark: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="yall-touch-btn"
      style={{
        padding: "5px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 13,
        background: active ? "var(--t-primary)" : "transparent",
        color: active ? "var(--t-primary-fg)" : "var(--t-muted)",
        fontWeight: active ? 600 : 400,
      }}
    >
      {children}
    </button>
  );
}

const iconBtn: React.CSSProperties = { padding: "6px 10px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "transparent", cursor: "pointer" };
