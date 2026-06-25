import { useMemo } from "react";
import { useAdmin } from "../AdminContext";
import { ADMIN_NAV_GROUPS } from "../types";
import { adminStyles } from "./AdminUi";
import { useIsTablet } from "../../../lib/useMediaQuery";

export function AdminSidebar() {
  const { activeTab, setActiveTab, accessibleTabs, user } = useAdmin();
  const isTablet = useIsTablet();

  const navGroups = useMemo(
    () =>
      ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((t) => accessibleTabs.includes(t.id)),
      })).filter((group) => group.tabs.length > 0),
    [accessibleTabs],
  );

  if (isTablet) {
    return (
      <select
        className="yall-admin-mobile-picker"
        value={activeTab}
        onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
        aria-label="Sección de administración"
      >
        {navGroups.map((group) => (
          <optgroup key={group.title} label={group.title}>
            {group.tabs.map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  return (
    <aside className="yall-admin-sidebar">
      <h2 style={{ margin: "0 0 4px", fontSize: 18, color: "var(--t-fg)" }}>Administración</h2>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "var(--t-muted)", lineHeight: 1.4 }}>
        Parametrización del restaurante
      </p>
      {user.roleName && (
        <p style={{ margin: "0 0 16px", fontSize: 11, color: "var(--t-muted)" }}>
          Rol: <strong style={{ color: "var(--t-muted)" }}>{user.roleName}</strong>
        </p>
      )}
      {navGroups.map((group) => (
        <div key={group.title} style={{ marginBottom: 16 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--t-muted)",
              marginBottom: 6,
              paddingLeft: 4,
            }}
          >
            {group.title}
          </div>
          {group.tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className="yall-touch-btn"
              style={adminStyles.navBtn(activeTab === t.id)}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
              <div style={adminStyles.navDesc}>{t.desc}</div>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}
