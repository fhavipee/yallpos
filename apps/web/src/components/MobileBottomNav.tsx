import type { AuthUser } from "../lib/auth";
import {
  canAccessAdmin,
  canViewCash,
  canViewDashboard,
  canViewFloor,
  canViewKds,
  canViewSettings,
} from "../lib/auth";

export type AppTab =
  | "counter"
  | "pickup-board"
  | "tables"
  | "order"
  | "host"
  | "kds"
  | "menu"
  | "attendance"
  | "dashboard"
  | "pilot"
  | "training"
  | "settings"
  | "admin"
  | "onboarding";

export const APP_TAB_LABELS: Record<AppTab, string> = {
  counter: "Mostrador",
  "pickup-board": "Retiro",
  tables: "Mesas",
  order: "Comanda",
  host: "Host",
  kds: "KDS",
  menu: "Menú",
  attendance: "Asistencia",
  dashboard: "Dashboard",
  pilot: "Piloto",
  training: "Capacitación",
  settings: "Configuración",
  admin: "Administración",
  onboarding: "+ Negocio",
};

const MAX_BOTTOM_TABS = 4;

type NavItem = {
  id: AppTab;
  icon: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  tab: AppTab;
  setTab: (tab: AppTab) => void;
  user: AuthUser;
  isRestaurant: boolean;
  hasTableSession: boolean;
  onMore: () => void;
};

export default function MobileBottomNav({
  tab,
  setTab,
  user,
  isRestaurant,
  hasTableSession,
  onMore,
}: Props) {
  const primary = buildBottomNavItems(user, isRestaurant, hasTableSession);
  const moreActive = !primary.some((i) => i.id === tab);

  return (
    <nav className="yall-app-bottom-nav" aria-label="Navegación principal">
      {primary.map((item) => (
        <BottomTab
          key={item.id}
          active={tab === item.id}
          icon={item.icon}
          label={item.label}
          dimmed={item.disabled}
          onClick={() => {
            if (item.disabled) {
              if (item.id === "order") alert("Primero abre una mesa");
              return;
            }
            setTab(item.id);
          }}
        />
      ))}
      <BottomTab
        active={moreActive}
        icon="⋯"
        label="Más"
        onClick={onMore}
      />
    </nav>
  );
}

function BottomTab({
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
      aria-current={active ? "page" : undefined}
    >
      <span className="yall-bottom-tab__icon">{icon}</span>
      <span className="yall-bottom-tab__label">{label}</span>
    </button>
  );
}

export function buildMoreMenuItems(
  user: AuthUser,
  isRestaurant: boolean,
  bottomTabIds: AppTab[] = [],
): { id: AppTab; label: string }[] {
  const inBar = new Set(bottomTabIds);
  const items: { id: AppTab; label: string }[] = [];

  const add = (id: AppTab) => {
    if (!inBar.has(id)) items.push({ id, label: APP_TAB_LABELS[id] });
  };

  if (canViewCash(user) || canViewFloor(user)) add("counter");
  if (isRestaurant && canViewFloor(user)) {
    add("tables");
    add("order");
    add("host");
    add("menu");
    add("training");
  }
  if (canViewCash(user) || canViewFloor(user)) add("pickup-board");
  if (canViewKds(user)) add("kds");
  add("attendance");
  if (canViewDashboard(user)) add("dashboard");
  add("pilot");
  if (canViewSettings(user)) add("settings");
  if (canAccessAdmin(user)) add("admin");
  add("onboarding");

  return items;
}

export function buildBottomNavItems(
  user: AuthUser,
  isRestaurant: boolean,
  hasTableSession: boolean,
): NavItem[] {
  const role = user.role;
  const items: NavItem[] = [];

  if (role === "kitchen" || role === "baker") {
    if (canViewKds(user)) items.push({ id: "kds", icon: "🍳", label: "KDS" });
    items.push({ id: "attendance", icon: "⏱️", label: "Asist." });
    return items.slice(0, MAX_BOTTOM_TABS);
  }

  if (role === "cashier") {
    if (canViewCash(user)) {
      items.push({ id: "counter", icon: "🛒", label: "Mostrador" });
      items.push({ id: "pickup-board", icon: "📦", label: "Retiro" });
    }
    items.push({ id: "attendance", icon: "⏱️", label: "Asist." });
    return items.slice(0, MAX_BOTTOM_TABS);
  }

  if (role === "waiter" && isRestaurant && canViewFloor(user)) {
    items.push({ id: "tables", icon: "🪑", label: "Mesas" });
    items.push({
      id: "order",
      icon: "📋",
      label: "Comanda",
      disabled: !hasTableSession,
    });
    items.push({ id: "attendance", icon: "⏱️", label: "Asist." });
    items.push({ id: "menu", icon: "📖", label: "Menú" });
    return items.slice(0, MAX_BOTTOM_TABS);
  }

  if (isRestaurant && canViewFloor(user)) {
    items.push({ id: "tables", icon: "🪑", label: "Mesas" });
    items.push({
      id: "order",
      icon: "📋",
      label: "Comanda",
      disabled: !hasTableSession,
    });
    if (canViewCash(user)) {
      items.push({ id: "counter", icon: "🛒", label: "Mostrador" });
    }
    items.push({ id: "host", icon: "🛎️", label: "Host" });
  } else if (canViewCash(user)) {
    items.push({ id: "counter", icon: "🛒", label: "Mostrador" });
    items.push({ id: "pickup-board", icon: "📦", label: "Retiro" });
  }

  if (canViewKds(user)) {
    items.push({ id: "kds", icon: "🍳", label: "KDS" });
  } else if (canViewDashboard(user)) {
    items.push({ id: "dashboard", icon: "📊", label: "Dash" });
  }

  if (!items.some((i) => i.id === "attendance")) {
    items.push({ id: "attendance", icon: "⏱️", label: "Asist." });
  }

  return items.slice(0, MAX_BOTTOM_TABS);
}
