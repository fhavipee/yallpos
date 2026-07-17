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
  CheckboxField,
  EmptyState,
  Field,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type PermissionDef = { key: string; label: string; group: string; description?: string; custom?: boolean };
type TenantRole = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  permissions: string[];
  legacyRole?: string;
  isSystem: boolean;
  userCount: number;
};

const emptyForm = () => ({
  name: "",
  description: "",
  permissions: [] as string[],
  legacyRole: "",
});

export default function AdminRolesView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | TenantRole | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [permModal, setPermModal] = useState(false);
  const [permForm, setPermForm] = useState({ label: "", group: "", description: "" });
  const [savingPerm, setSavingPerm] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [rolesRes, permsRes] = await Promise.all([
      api.get("/v1/admin/roles"),
      api.get("/v1/admin/permissions"),
    ]);
    return {
      roles: rolesRes.data as TenantRole[],
      catalog: permsRes.data as PermissionDef[],
    };
  }, []);

  const roles = data?.roles ?? [];
  const catalog = data?.catalog ?? [];

  const grouped = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of catalog) {
      const list = map.get(p.group) ?? [];
      list.push(p);
      map.set(p.group, list);
    }
    return [...map.entries()];
  }, [catalog]);

  function openNew(from?: TenantRole) {
    setForm({
      name: from ? `${from.name} (copia)` : "",
      description: from?.description ?? "",
      permissions: from ? [...from.permissions.filter((p) => p !== "*")] : [],
      legacyRole: from?.legacyRole ?? "",
    });
    setModal("new");
  }

  function openEdit(role: TenantRole) {
    setForm({
      name: role.name,
      description: role.description ?? "",
      permissions: role.permissions.filter((p) => p !== "*"),
      legacyRole: role.legacyRole ?? "",
    });
    setModal(role);
  }

  function togglePermission(key: string) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  async function savePermission() {
    setSavingPerm(true);
    await runAction(async () => {
      await api.post("/v1/admin/permissions", {
        label: permForm.label.trim(),
        group: permForm.group.trim() || undefined,
        description: permForm.description.trim() || undefined,
      });
      setPermModal(false);
      setPermForm({ label: "", group: "", description: "" });
      await reload();
    }, "Opción de permiso creada");
    setSavingPerm(false);
  }

  async function deletePermission(key: string, label: string) {
    if (!window.confirm(`¿Eliminar la opción de permiso "${label}"? Se quitará de los roles que la usen.`)) return;
    await runAction(async () => {
      await api.delete(`/v1/admin/permissions/${encodeURIComponent(key)}`);
      setForm((f) => ({ ...f, permissions: f.permissions.filter((p) => p !== key) }));
      await reload();
    }, "Opción eliminada");
  }

  async function save() {
    setSaving(true);
    const body = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      permissions: form.permissions,
      legacyRole: form.legacyRole || undefined,
    };
    await runAction(async () => {
      if (modal === "new") await api.post("/v1/admin/roles", body);
      else if (modal) await api.patch(`/v1/admin/roles/${modal.id}`, body);
      setModal(null);
      await reload();
    }, modal === "new" ? "Rol creado" : "Rol actualizado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Roles y permisos"
          desc="Define qué puede hacer cada perfil. Los roles del sistema son plantillas; crea roles custom para tu operación."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={() => openNew()}>
                + Rol custom
              </button>
            </>
          }
        />

        <AdminSection title={`Roles (${roles.length})`}>
          {roles.length === 0 ? (
            <EmptyState text="Sin roles — recarga la página para generar los roles del sistema." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Tipo</th>
                  <th style={adminStyles.th}>Permisos</th>
                  <th style={adminStyles.th}>Usuarios</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.id}>
                    <td style={adminStyles.td}>
                      <strong>{r.name}</strong>
                      {r.description && <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{r.description}</div>}
                    </td>
                    <td style={adminStyles.td}>
                      {r.isSystem ? <Badge ok label="Sistema" /> : <span style={{ fontSize: 12 }}>Custom</span>}
                    </td>
                    <td style={adminStyles.td}>
                      {r.permissions.includes("*") ? "Todos (*)" : `${r.permissions.length} permiso(s)`}
                    </td>
                    <td style={adminStyles.td}>{r.userCount}</td>
                    <td style={adminStyles.td}>
                      {r.isSystem ? (
                        <button type="button" style={adminStyles.btnSecondary} onClick={() => openNew(r)}>Duplicar</button>
                      ) : (
                        <>
                          <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(r)}>Editar</button>{" "}
                          <button type="button" style={adminStyles.btnDanger} disabled={r.userCount > 0} onClick={async () => {
                            if (!window.confirm(`¿Eliminar rol "${r.name}"?`)) return;
                            await runAction(async () => {
                              await api.delete(`/v1/admin/roles/${r.id}`);
                              await reload();
                            }, "Rol eliminado");
                          }}>×</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal
            title={modal === "new" ? "Nuevo rol" : `Editar: ${modal.name}`}
            onClose={() => setModal(null)}
            footer={<ModalFooter onCancel={() => setModal(null)} onSave={save} saving={saving} disabled={!form.name.trim() || form.permissions.length === 0} />}
          >
            <Field label="Nombre del rol">
              <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Supervisor de sala" />
            </Field>
            <Field label="Descripción">
              <input style={adminStyles.input} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <Field label="Rol legacy (opcional)" hint="Solo referencia interna; los permisos mandan">
              <select style={adminStyles.select} value={form.legacyRole} onChange={(e) => setForm({ ...form, legacyRole: e.target.value })}>
                <option value="">— Ninguno —</option>
                <option value="manager">Gerente</option>
                <option value="cashier">Cajero</option>
                <option value="waiter">Mesero</option>
                <option value="kitchen">Cocina</option>
                <option value="baker">Panadero</option>
              </select>
            </Field>
            <div style={{ marginTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "var(--t-muted)" }}>
                  Permisos ({form.permissions.length})
                </div>
                <button type="button" style={adminStyles.btnSecondary} onClick={() => setPermModal(true)}>
                  + Nueva opción
                </button>
              </div>
              {grouped.map(([group, perms]) => (
                <div key={group} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--t-muted)", textTransform: "uppercase", marginBottom: 6 }}>{group}</div>
                  {perms.map((p) => (
                    <div key={p.key} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                      <div style={{ flex: 1 }}>
                        <CheckboxField
                          label={p.custom ? `${p.label} (custom)` : p.label}
                          hint={p.description}
                          checked={form.permissions.includes(p.key)}
                          onChange={() => togglePermission(p.key)}
                        />
                      </div>
                      {p.custom && (
                        <button
                          type="button"
                          title="Eliminar opción personalizada"
                          style={{ ...adminStyles.btnDanger, padding: "2px 8px", marginTop: 2 }}
                          onClick={() => deletePermission(p.key, p.label)}
                        >
                          ×
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </AdminModal>
        )}

        {permModal && (
          <AdminModal
            title="Nueva opción de permiso"
            onClose={() => setPermModal(false)}
            footer={
              <ModalFooter
                onCancel={() => setPermModal(false)}
                onSave={savePermission}
                saving={savingPerm}
                disabled={permForm.label.trim().length < 2}
              />
            }
          >
            <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 0 }}>
              Agrega una opción a la lista de permisos. Queda disponible para asignarla a cualquier rol.
            </p>
            <Field label="Nombre de la opción">
              <input
                style={adminStyles.input}
                value={permForm.label}
                onChange={(e) => setPermForm({ ...permForm, label: e.target.value })}
                placeholder="Ej. Aplicar descuentos"
              />
            </Field>
            <Field label="Grupo" hint="Encabezado bajo el que se mostrará (opcional)">
              <input
                style={adminStyles.input}
                value={permForm.group}
                onChange={(e) => setPermForm({ ...permForm, group: e.target.value })}
                placeholder="Personalizados"
              />
            </Field>
            <Field label="Descripción (opcional)">
              <input
                style={adminStyles.input}
                value={permForm.description}
                onChange={(e) => setPermForm({ ...permForm, description: e.target.value })}
              />
            </Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
