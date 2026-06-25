import { api } from "../../../lib/api";
import { useAdmin } from "../AdminContext";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  Badge,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";
import { CHECKLIST_TAB_MAP, type AdminTab, type SetupStatus } from "../types";
import { canAccessAdminTab } from "../../../lib/permissions";

export default function AdminOverviewView() {
  const { setActiveTab, user } = useAdmin();
  const runAction = useAdminAction();

  const { data: setup, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/setup");
    return r.data as SetupStatus;
  }, []);

  const blocking = setup?.checklist.filter((c) => c.blocking) ?? [];
  const optional = setup?.checklist.filter((c) => !c.blocking) ?? [];
  const blockingDone = blocking.filter((c) => c.ok).length;

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload} loadingText="Cargando checklist…">
      {setup && (
        <>
          <AdminPageHeader
            title="Resumen pre-producción"
            desc={`${setup.branch.name} — verifica parametrización antes de abrir al público.`}
            actions={<ReloadButton onClick={reload} />}
          />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
            <StatCard label="Software operativo" ok={setup.readyForProduction} />
            <StatCard label="DIAN habilitado" ok={setup.readyForDian} note={setup.fiscalSimulation ? "Simulación activa" : undefined} />
            <StatCard label="Checklist bloqueante" ok={blockingDone === blocking.length} detail={`${blockingDone}/${blocking.length}`} />
            <StatCard label="Mesas" ok={(setup.counts.tables ?? 0) > 0} detail={String(setup.counts.tables ?? 0)} />
            <StatCard label="Productos" ok={(setup.counts.products ?? 0) > 0} detail={String(setup.counts.products ?? 0)} />
            <StatCard label="Personal" ok={(setup.counts.staff ?? 0) > 0} detail={String(setup.counts.staff ?? 0)} />
          </div>

          {setup.blockingPending.length > 0 && (
            <div style={{ ...adminStyles.section, background: "var(--t-warn-soft)", borderColor: "var(--t-warn-border)", marginBottom: 16 }}>
              <strong style={{ color: "#b45309" }}>Pendiente bloqueante:</strong>{" "}
              <span style={{ fontSize: 13 }}>{setup.blockingPending.join(" · ")}</span>
            </div>
          )}

          <AdminSection title="Checklist bloqueante" desc="Clic en un ítem pendiente te lleva a la vista correspondiente.">
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {blocking.map((c) => (
                <ChecklistRow
                  key={c.id}
                  item={c}
                  showFix={!!CHECKLIST_TAB_MAP[c.id] && canAccessAdminTab(user, CHECKLIST_TAB_MAP[c.id])}
                  onFix={() => {
                    const tab = CHECKLIST_TAB_MAP[c.id];
                    if (tab) setActiveTab(tab);
                  }}
                />
              ))}
            </ul>
          </AdminSection>

          <AdminSection title="Opcional / DIAN real">
            <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
              {optional.map((c) => (
                <ChecklistRow
                  key={c.id}
                  item={c}
                  showFix={!!CHECKLIST_TAB_MAP[c.id] && canAccessAdminTab(user, CHECKLIST_TAB_MAP[c.id])}
                  onFix={() => {
                    const tab = CHECKLIST_TAB_MAP[c.id];
                    if (tab) setActiveTab(tab);
                  }}
                />
              ))}
            </ul>
          </AdminSection>

          {!setup.readyForProduction && (
            <button
              type="button"
              style={adminStyles.btnPrimary}
              onClick={async () => {
                await runAction(async () => {
                  await api.post("/v1/admin/setup/apply-defaults");
                  await reload();
                }, "Defaults aplicados (pagos, PIN, impresoras)");
              }}
            >
              Aplicar defaults operativos
            </button>
          )}
        </>
      )}
    </AdminViewGate>
  );
}

function ChecklistRow({
  item,
  onFix,
  showFix,
}: {
  item: { id: string; label: string; ok: boolean; blocking: boolean; count?: number; note?: string };
  onFix: () => void;
  showFix: boolean;
}) {
  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "10px 0",
        borderBottom: "1px solid var(--t-border)",
        color: item.ok ? "var(--t-success-fg)" : item.blocking ? "var(--t-warn-fg)" : "var(--t-muted)",
      }}
    >
      <span>
        {item.ok ? "✓" : item.blocking ? "○" : "◇"} {item.label}
        {item.count != null ? ` (${item.count})` : ""}
        {item.note ? ` — ${item.note}` : ""}
      </span>
      {!item.ok && showFix && (
        <button type="button" style={adminStyles.btnSecondary} onClick={onFix}>
          Configurar →
        </button>
      )}
    </li>
  );
}

function StatCard({ label, ok, detail, note }: { label: string; ok: boolean; detail?: string; note?: string }) {
  return (
    <div style={{ ...adminStyles.section, marginBottom: 0, padding: 16 }}>
      <div style={{ fontSize: 12, color: "var(--t-muted)", marginBottom: 8 }}>{label}</div>
      <Badge ok={ok} label={ok ? "Listo" : "Pendiente"} />
      {detail && <div style={{ fontSize: 22, fontWeight: 700, marginTop: 8 }}>{detail}</div>}
      {note && <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 4 }}>{note}</div>}
    </div>
  );
}
