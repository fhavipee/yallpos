import { useMemo } from "react";
import { useAdmin } from "../AdminContext";
import { ADMIN_NAV_GROUPS } from "../types";
import { adminStyles } from "./AdminUi";

export function AdminSidebar() {
  const { activeTab, setActiveTab, accessibleTabs, user } = useAdmin();

  const navGroups = useMemo(
    () =>
      ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        tabs: group.tabs.filter((t) => accessibleTabs.includes(t.id)),
      })).filter((group) => group.tabs.length > 0),
    [accessibleTabs],
  );

  return (
    <aside style={adminStyles.sidebar}>
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
