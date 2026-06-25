import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminModal,
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  Badge,
  EmptyState,
  Field,
  IdChip,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type TaxDefinition = {
  id: string;
  kind: "iva" | "consumption";
  code: string;
  name: string;
  rate: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
};

const emptyForm = () => ({
  kind: "iva" as "iva" | "consumption",
  code: "",
  name: "",
  ratePercent: "19",
  isDefault: false,
  isActive: true,
  sortOrder: "99",
});

export default function AdminTaxesView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | TaxDefinition | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const res = await api.get("/v1/admin/taxes");
    return { taxes: res.data as TaxDefinition[] };
  }, []);

  const taxes = data?.taxes ?? [];

  const ivaTaxes = useMemo(() => taxes.filter((t) => t.kind === "iva"), [taxes]);
  const consumptionTaxes = useMemo(() => taxes.filter((t) => t.kind === "consumption"), [taxes]);

  function openEdit(t: TaxDefinition) {
    setForm({
      kind: t.kind,
      code: t.code,
      name: t.name,
      ratePercent: String(Math.round(Number(t.rate) * 10000) / 100),
      isDefault: t.isDefault,
      isActive: t.isActive,
      sortOrder: String(t.sortOrder),
    });
    setModal(t);
  }

  async function save() {
    setSaving(true);
    const rate = Number(form.ratePercent) / 100;
    const payload = {
      kind: form.kind,
      code: form.code,
      name: form.name.trim(),
      rate,
      isDefault: form.isDefault,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 99,
    };
    await runAction(async () => {
      if (modal === "new") {
        await api.post("/v1/admin/taxes", payload);
      } else if (modal) {
        await api.patch(`/v1/admin/taxes/${modal.id}`, {
          name: payload.name,
          rate: payload.rate,
          isDefault: payload.isDefault,
          isActive: payload.isActive,
          sortOrder: payload.sortOrder,
        });
      }
      setModal(null);
      await reload();
    }, modal === "new" ? "Impuesto creado" : "Impuesto actualizado");
    setSaving(false);
  }

  function renderTable(list: TaxDefinition[], kindLabel: string) {
    const active = list.filter((t) => t.isActive);
    if (active.length === 0) {
      return <EmptyState text={`Sin impuestos ${kindLabel} activos.`} />;
    }
    return (
      <table style={adminStyles.table}>
        <thead>
          <tr>
            <th style={adminStyles.th}>Nombre</th>
            <th style={adminStyles.th}>Código</th>
            <th style={adminStyles.th}>Tarifa</th>
            <th style={adminStyles.th}>Default</th>
            <th style={adminStyles.th}></th>
          </tr>
        </thead>
        <tbody>
          {active.map((t) => (
            <tr key={t.id}>
              <td style={adminStyles.td}>
                <strong>{t.name}</strong>
                <div><IdChip id={t.id} /></div>
              </td>
              <td style={adminStyles.td}><code>{t.code}</code></td>
              <td style={adminStyles.td}>{(Number(t.rate) * 100).toFixed(2)}%</td>
              <td style={adminStyles.td}>
                {t.isDefault ? <Badge ok label="Sí" /> : "—"}
              </td>
              <td style={adminStyles.td}>
                <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(t)}>Editar</button>{" "}
                <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                  await runAction(async () => {
                    await api.delete(`/v1/admin/taxes/${t.id}`);
                    await reload();
                  }, "Impuesto desactivado");
                }}>Desactivar</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Impuestos"
          desc="IVA e impoconsumo configurables por empresa. Los productos referencian estos códigos; las ventas guardan la tarifa vigente al momento del cobro."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button
                type="button"
                style={{ ...adminStyles.btnSecondary, marginLeft: 8 }}
                onClick={async () => {
                  await runAction(async () => {
                    await api.post("/v1/admin/taxes/seed-defaults");
                    await reload();
                  }, "Tarifas Colombia restauradas");
                }}
              >
                Restaurar Colombia
              </button>
              <button
                type="button"
                style={{ ...adminStyles.btnPrimary, marginLeft: 8 }}
                onClick={() => { setForm(emptyForm()); setModal("new"); }}
              >
                + Impuesto
              </button>
            </>
          }
        />

        <AdminSection title="IVA" desc="Impuesto al valor agregado">
          {renderTable(ivaTaxes, "de IVA")}
        </AdminSection>

        <AdminSection title="Impoconsumo" desc="Impuesto nacional al consumo (licores, cervezas, etc.)">
          {renderTable(consumptionTaxes, "de impoconsumo")}
        </AdminSection>

        {modal && (
          <AdminModal
            title={modal === "new" ? "Nuevo impuesto" : "Editar impuesto"}
            onClose={() => setModal(null)}
            footer={
              <ModalFooter
                onCancel={() => setModal(null)}
                onSave={save}
                saving={saving}
                saveLabel={modal === "new" ? "Crear" : "Guardar"}
              />
            }
          >
            {modal === "new" && (
              <>
                <Field label="Tipo">
                  <select style={adminStyles.select} value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "iva" | "consumption" })}>
                    <option value="iva">IVA</option>
                    <option value="consumption">Impoconsumo</option>
                  </select>
                </Field>
                <Field label="Código (único)">
                  <input style={adminStyles.input} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="ej. iva_19, inc_8" />
                </Field>
              </>
            )}
            <Field label="Nombre">
              <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Tarifa (%)">
              <input type="number" step="0.01" min="0" max="100" style={adminStyles.input} value={form.ratePercent} onChange={(e) => setForm({ ...form, ratePercent: e.target.value })} />
            </Field>
            <Field label="Orden">
              <input type="number" style={adminStyles.input} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: e.target.value })} />
            </Field>
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Predeterminado para este tipo
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} />
              Activo
            </label>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
