import { useState } from "react";
import { api } from "../../../lib/api";
import { useAdmin } from "../AdminContext";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";
import { PAYMENT_METHODS } from "../types";

export default function AdminPaymentsView() {
  const { toast } = useAdmin();
  const runAction = useAdminAction();
  const [enabled, setEnabled] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const { loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/payment-methods");
    setEnabled(r.data.enabled ?? []);
    return true;
  }, []);

  async function save() {
    if (enabled.length === 0) {
      toast("Debe habilitar al menos un método de pago", "err");
      return;
    }
    setSaving(true);
    await runAction(async () => {
      await api.patch("/v1/admin/payment-methods", { enabled });
    }, "Métodos de pago guardados");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Métodos de pago"
          desc="Controla qué formas de cobro aparecen en caja y cierre de mesa."
          actions={<ReloadButton onClick={reload} />}
        />

        <AdminSection title={`Métodos habilitados (${enabled.length}/${PAYMENT_METHODS.length})`}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
            {PAYMENT_METHODS.map((m) => (
              <label
                key={m.value}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  padding: 12,
                  border: "1px solid var(--t-border)",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: enabled.includes(m.value) ? "var(--t-accent-soft)" : "var(--t-card)",
                }}
              >
                <input
                  type="checkbox"
                  checked={enabled.includes(m.value)}
                  onChange={(e) => setEnabled(e.target.checked ? [...enabled, m.value] : enabled.filter((x) => x !== m.value))}
                />
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: "var(--t-muted)" }}>{m.value}</div>
                </div>
              </label>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 12 }}>
            Efectivo suele ser obligatorio para restaurantes. Tarjeta y transferencia dependen de tu operación.
          </p>
          <button type="button" style={{ ...adminStyles.btnPrimary, marginTop: 16 }} disabled={saving} onClick={save}>
            {saving ? "Guardando…" : "Guardar métodos"}
          </button>
        </AdminSection>
      </>
    </AdminViewGate>
  );
}
