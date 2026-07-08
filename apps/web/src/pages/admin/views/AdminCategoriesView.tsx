import { useState } from "react";
import { api } from "../../../lib/api";
import CategoryImagePicker from "../../../components/CategoryImagePicker";
import { categoryImageLabel, suggestCategoryImage } from "../../../lib/categoryImages";
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
  description?: string | null;
  color?: string;
  imageUrl?: string | null;
  mobileDisplay?: "image" | "description";
  sortOrder: number;
  isActive: boolean;
};

type FormState = {
  name: string;
  description: string;
  color: string;
  imageUrl: string;
  mobileDisplay: "image" | "description";
  sortOrder: number;
};

const emptyForm = (sortOrder = 0): FormState => ({
  name: "",
  description: "",
  color: "#2563eb",
  imageUrl: "",
  mobileDisplay: "image",
  sortOrder,
});

export default function AdminCategoriesView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | Category | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data: categories, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/categories");
    return r.data as Category[];
  }, []);

  const active = (categories ?? []).filter((c) => c.isActive);

  function openNew() {
    setForm(emptyForm(active.length + 1));
    setModal("new");
  }

  function onNameChange(name: string) {
    setForm((prev: FormState) => ({
      ...prev,
      name,
      imageUrl: prev.imageUrl || suggestCategoryImage(name) || prev.imageUrl,
    }));
  }

  function openEdit(c: Category) {
    setForm({
      name: c.name,
      description: c.description ?? "",
      color: c.color ?? "#2563eb",
      imageUrl: c.imageUrl ?? "",
      mobileDisplay: c.mobileDisplay === "description" ? "description" : "image",
      sortOrder: c.sortOrder,
    });
    setModal(c);
  }

  function payloadFromForm() {
    return {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      color: form.color,
      imageUrl: form.imageUrl.trim() || undefined,
      mobileDisplay: form.mobileDisplay,
      sortOrder: form.sortOrder,
    };
  }

  async function save() {
    setSaving(true);
    const ok = await runAction(async () => {
      const payload = payloadFromForm();
      if (modal === "new") {
        await api.post("/v1/catalog/categories", payload);
      } else if (modal) {
        await api.patch(`/v1/admin/categories/${modal.id}`, payload);
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
          desc="Organizan el menú en POS, comanda y reportes. Puedes elegir si la imagen se ve en el celular."
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
                  <th style={adminStyles.th}>Imagen</th>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Imagen en móvil</th>
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
                    <td style={adminStyles.td}>
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt="" title={categoryImageLabel(c.imageUrl) ?? ""} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", border: "1px solid var(--t-border)" }} />
                      ) : (
                        <span style={{ color: "var(--t-muted)", fontSize: 12 }}>—</span>
                      )}
                    </td>
                    <td style={adminStyles.td}>
                      <strong>{c.name}</strong>
                      {c.description && (
                        <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 4, maxWidth: 220 }}>
                          {c.description.length > 80 ? `${c.description.slice(0, 80)}…` : c.description}
                        </div>
                      )}
                    </td>
                    <td style={adminStyles.td}>
                      {c.mobileDisplay === "description" ? "No" : "Sí"}
                    </td>
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
              <input style={adminStyles.input} value={form.name} onChange={(e) => onNameChange(e.target.value)} />
            </Field>
            <Field label="Descripción (opcional, solo referencia interna)">
              <textarea
                style={{ ...adminStyles.input, minHeight: 72, resize: "vertical" }}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Notas sobre la categoría (no se muestra en la comanda)"
              />
            </Field>
            <Field label="Imagen de categoría">
              <CategoryImagePicker
                value={form.imageUrl}
                onChange={(path) => setForm({ ...form, imageUrl: path })}
              />
            </Field>
            <Field label="Imagen en móvil">
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="mobileDisplay"
                    checked={form.mobileDisplay === "image"}
                    onChange={() => setForm({ ...form, mobileDisplay: "image" })}
                  />
                  Mostrar imagen junto al nombre
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="mobileDisplay"
                    checked={form.mobileDisplay === "description"}
                    onChange={() => setForm({ ...form, mobileDisplay: "description" })}
                  />
                  Solo nombre (sin imagen)
                </label>
              </div>
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
