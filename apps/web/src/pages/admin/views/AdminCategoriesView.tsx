import { useState } from "react";
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

type Category = {
  id: string;
  name: string;
  color?: string;
  sortOrder: number;
  isActive: boolean;
};

export default function AdminCategoriesView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | Category | null>(null);
  const [form, setForm] = useState({ name: "", color: "#2563eb", sortOrder: 0 });
  const [saving, setSaving] = useState(false);

  const { data: categories, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/categories");
    return r.data as Category[];
  }, []);

  const active = (categories ?? []).filter((c) => c.isActive);

  function openNew() {
    setForm({ name: "", color: "#2563eb", sortOrder: active.length + 1 });
    setModal("new");
  }

  function openEdit(c: Category) {
    setForm({ name: c.name, color: c.color ?? "#2563eb", sortOrder: c.sortOrder });
    setModal(c);
  }

  async function save() {
    setSaving(true);
    const ok = await runAction(async () => {
      if (modal === "new") {
        await api.post("/v1/catalog/categories", { name: form.name, color: form.color, sortOrder: form.sortOrder });
      } else if (modal) {
        await api.patch(`/v1/admin/categories/${modal.id}`, form);
      }
      setModal(null);
      await reload();
    }, modal === "new" ? "Categoría creada" : "Categoría actualizada");
    setSaving(false);
    if (!ok) return;
  }

  async function deactivate(c: Category) {
    if (!window.confirm(`¿Desactivar "${c.name}"? Debe estar vacía de productos activos.`)) return;
    await runAction(async () => {
      await api.delete(`/v1/admin/categories/${c.id}`);
      await reload();
    }, "Categoría desactivada");
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Categorías"
          desc="Organizan el menú en POS, comanda y reportes."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={openNew}>+ Nueva categoría</button>
            </>
          }
        />

        <AdminSection title={`${active.length} categorías activas`}>
          {active.length === 0 ? (
            <EmptyState text="Sin categorías — crea al menos una antes de productos." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Color</th>
                  <th style={adminStyles.th}>Orden</th>
                  <th style={adminStyles.th}>ID</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {active.map((c) => (
                  <tr key={c.id}>
                    <td style={adminStyles.td}><strong>{c.name}</strong></td>
                    <td style={adminStyles.td}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 14, height: 14, borderRadius: 4, background: c.color ?? "#cbd5e1", border: "1px solid var(--t-border)" }} />
                        {c.color ?? "—"}
                      </span>
                    </td>
                    <td style={adminStyles.td}>{c.sortOrder}</td>
                    <td style={adminStyles.td}><IdChip id={c.id} /></td>
                    <td style={adminStyles.td}><Badge ok={c.isActive} label={c.isActive ? "Activa" : "Inactiva"} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(c)}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={() => deactivate(c)}>Desactivar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal
            title={modal === "new" ? "Nueva categoría" : "Editar categoría"}
            onClose={() => setModal(null)}
            footer={<ModalFooter onCancel={() => setModal(null)} onSave={save} saving={saving} disabled={!form.name.trim()} />}
          >
            <Field label="Nombre">
              <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Color">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} style={{ width: 44, height: 36, border: "none", cursor: "pointer" }} />
                <input style={adminStyles.input} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} />
              </div>
            </Field>
            <Field label="Orden en menú">
              <input type="number" style={adminStyles.input} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
            </Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
