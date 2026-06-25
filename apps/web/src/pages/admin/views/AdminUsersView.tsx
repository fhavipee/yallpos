import { useState } from "react";
import { api } from "../../../lib/api";
import { useAdmin } from "../AdminContext";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminModal,
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  EmptyState,
  Field,
  IdChip,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type TenantRole = { id: string; name: string; slug: string; isSystem: boolean; legacyRole?: string };
type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  roleId?: string;
  isActive: boolean;
  lastLoginAt?: string;
  tenantRole?: { id: string; name: string; slug: string; isSystem: boolean };
};

export default function AdminUsersView() {
  const { toast } = useAdmin();
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | User | null>(null);
  const [resetId, setResetId] = useState<string | null>(null);
  const [form, setForm] = useState({ email: "", name: "", roleId: "", password: "" });
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [usersRes, rolesRes] = await Promise.all([
      api.get("/v1/admin/users"),
      api.get("/v1/admin/roles"),
    ]);
    return {
      users: usersRes.data as User[],
      roles: rolesRes.data as TenantRole[],
    };
  }, []);

  const users = data?.users ?? [];
  const roles = data?.roles ?? [];
  const active = users.filter((u) => u.isActive);
  const defaultRoleId = roles.find((r) => r.slug === "waiter")?.id ?? roles[0]?.id ?? "";

  function openNew() {
    setForm({ email: "", name: "", roleId: defaultRoleId, password: "" });
    setModal("new");
  }

  function openEdit(u: User) {
    setForm({ email: u.email, name: u.name, roleId: u.roleId ?? u.tenantRole?.id ?? defaultRoleId, password: "" });
    setModal(u);
  }

  async function saveUser() {
    if (modal === "new" && (!form.password || form.password.length < 6)) {
      toast("Contraseña mínimo 6 caracteres", "err");
      return;
    }
    if (!form.roleId) {
      toast("Selecciona un rol", "err");
      return;
    }
    setSaving(true);
    const body: Record<string, string> = {
      email: form.email.trim(),
      name: form.name.trim(),
      roleId: form.roleId,
    };
    if (form.password) body.password = form.password;
    await runAction(async () => {
      if (modal === "new") await api.post("/v1/admin/users", body);
      else if (modal) await api.patch(`/v1/admin/users/${modal.id}`, body);
      setModal(null);
      await reload();
    }, "Usuario guardado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Usuarios del sistema"
          desc="Credenciales de acceso al POS. Asigna un rol con permisos definidos en Admin → Roles."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={openNew}>+ Usuario</button>
            </>
          }
        />

        <AdminSection title={`Cuentas activas (${active.length})`}>
          {active.length === 0 ? (
            <EmptyState text="Sin usuarios — crea al menos un gerente y un mesero." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Email</th>
                  <th style={adminStyles.th}>Rol</th>
                  <th style={adminStyles.th}>Último login</th>
                  <th style={adminStyles.th}>ID</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {active.map((u) => (
                  <tr key={u.id}>
                    <td style={adminStyles.td}><strong>{u.name}</strong></td>
                    <td style={adminStyles.td}>{u.email}</td>
                    <td style={adminStyles.td}>
                      {u.tenantRole?.name ?? u.role}
                      {u.tenantRole && !u.tenantRole.isSystem && <span style={{ fontSize: 11, color: "var(--t-muted)" }}> (custom)</span>}
                    </td>
                    <td style={adminStyles.td}>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString("es-CO") : "Nunca"}</td>
                    <td style={adminStyles.td}><IdChip id={u.id} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(u)}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setResetId(u.id); setNewPassword(""); }}>Contraseña</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/users/${u.id}`); await reload(); }, "Usuario desactivado");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal title={modal === "new" ? "Nuevo usuario" : "Editar usuario"} onClose={() => setModal(null)} footer={
            <ModalFooter onCancel={() => setModal(null)} onSave={saveUser} saving={saving} disabled={!form.email.trim() || !form.name.trim() || !form.roleId} />
          }>
            <Field label="Nombre"><input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email (login)"><input type="email" style={adminStyles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Rol" hint="Gestiona permisos en Admin → Roles">
              <select style={adminStyles.select} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}{r.isSystem ? "" : " (custom)"}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={modal === "new" ? "Contraseña inicial" : "Nueva contraseña (opcional)"} hint="Mínimo 6 caracteres">
              <input type="password" style={adminStyles.input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          </AdminModal>
        )}

        {resetId && (
          <AdminModal title="Reset contraseña" onClose={() => setResetId(null)} footer={
            <ModalFooter onCancel={() => setResetId(null)} onSave={async () => {
              setSaving(true);
              await runAction(async () => {
                await api.post(`/v1/admin/users/${resetId}/reset-password`, { password: newPassword });
                setResetId(null);
              }, "Contraseña actualizada");
              setSaving(false);
            }} saving={saving} saveLabel="Actualizar" disabled={newPassword.length < 6} />
          }>
            <Field label="Nueva contraseña"><input type="password" style={adminStyles.input} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
