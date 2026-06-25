import { api } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  IdChip,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

const TEMPLATE_LABELS: Record<string, string> = {
  restaurant: "Restaurante",
  bakery: "Panadería",
  cafe: "Café",
};

export default function AdminOnboardingView() {
  const runAction = useAdminAction();

  const { data: state, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/onboarding/state");
    return r.data;
  }, []);

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      {state && (
        <>
          <AdminPageHeader
            title="Onboarding"
            desc="Herramientas para inicializar o re-aplicar plantillas sin crear un tenant nuevo."
            actions={<ReloadButton onClick={reload} />}
          />

          <AdminSection title="Estado del wizard">
            <dl style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "8px 16px", fontSize: 14, margin: 0 }}>
              <dt style={{ color: "var(--t-muted)" }}>Empresa</dt><dd><IdChip id={state.companyId} /></dd>
              <dt style={{ color: "var(--t-muted)" }}>Sucursal</dt><dd><IdChip id={state.branchId} /></dd>
              <dt style={{ color: "var(--t-muted)" }}>Vertical</dt><dd>{state.vertical}</dd>
              <dt style={{ color: "var(--t-muted)" }}>Tipo sucursal</dt><dd>{state.branchType}</dd>
            </dl>
            <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 16 }}>{state.note}</p>
            <div style={{ fontSize: 12, color: "var(--t-muted)" }}>Pasos: {(state.steps as string[]).join(" → ")}</div>
          </AdminSection>

          <AdminSection title="Plantillas de catálogo" desc="Crea categorías y productos base según vertical. No borra productos existentes duplicados por nombre.">
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["restaurant", "bakery", "cafe"] as const).map((template) => (
                <button
                  key={template}
                  type="button"
                  style={adminStyles.btnSecondary}
                  onClick={async () => {
                    if (!window.confirm(`¿Reaplicar plantilla "${TEMPLATE_LABELS[template]}"?`)) return;
                    await runAction(async () => {
                      await api.post("/v1/admin/onboarding/reapply-catalog", { template });
                      await reload();
                    }, `Plantilla ${TEMPLATE_LABELS[template]} aplicada`);
                  }}
                >
                  Reaplicar {TEMPLATE_LABELS[template]}
                </button>
              ))}
            </div>
          </AdminSection>

          <AdminSection title="Wizard completo (+ Negocio)" desc="Para crear un tenant desde cero usa la pestaña + Negocio en la barra principal.">
            <button type="button" style={adminStyles.btnSecondary} onClick={() => window.open("/?view=onboarding", "_self")}>
              Ir a + Negocio
            </button>
          </AdminSection>
        </>
      )}
    </AdminViewGate>
  );
}
