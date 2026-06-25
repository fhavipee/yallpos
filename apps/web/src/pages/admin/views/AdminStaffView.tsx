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
import { STAFF_ROLES } from "../types";

type Staff = { id: string; name: string; role: string; phone?: string; isActive: boolean };

export default function AdminStaffView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | Staff | null>(null);
  const [form, setForm] = useState({ name: "", role: "waiter", phone: "" });
  const [saving, setSaving] = useState(false);

  const { data: staff, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/staff");
    return r.data as Staff[];
  }, []);

  const active = (staff ?? []).filter((s) => s.isActive);
  const roleLabel = (v: string) => STAFF_ROLES.find((r) => r.value === v)?.label ?? v;

  async function save() {
    setSaving(true);
    const body = { name: form.name.trim(), role: form.role, phone: form.phone.trim() || undefined };
    await runAction(async () => {
      if (modal === "new") await api.post("/v1/admin/staff", body);
      else if (modal) await api.patch(`/v1/admin/staff/${modal.id}`, body);
      setModal(null);
      await reload();
    }, "Personal guardado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Personal de piso"
          desc="Meseros, cocina y caja para asignación en mesas, KDS y reservas. Distinto de usuarios con login."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={() => { setForm({ name: "", role: "waiter", phone: "" }); setModal("new"); }}>+ Personal</button>
            </>
          }
        />

        <AdminSection title={`Equipo (${active.length})`}>
          {active.length === 0 ? (
            <EmptyState text="Sin personal — agrega al menos un mesero para operación en piso." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Rol</th>
                  <th style={adminStyles.th}>Teléfono / WhatsApp</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}>ID</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {active.map((s) => (
                  <tr key={s.id}>
                    <td style={adminStyles.td}><strong>{s.name}</strong></td>
                    <td style={adminStyles.td}>{roleLabel(s.role)}</td>
                    <td style={adminStyles.td}>{s.phone ?? "—"}</td>
                    <td style={adminStyles.td}><Badge ok={s.isActive} /></td>
                    <td style={adminStyles.td}><IdChip id={s.id} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setForm({ name: s.name, role: s.role, phone: s.phone ?? "" }); setModal(s); }}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/staff/${s.id}`); await reload(); }, "Personal desactivado");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal title={modal === "new" ? "Nuevo personal" : "Editar personal"} onClose={() => setModal(null)} footer={
            <ModalFooter onCancel={() => setModal(null)} onSave={save} saving={saving} disabled={!form.name.trim()} />
          }>
            <Field label="Nombre completo"><input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Rol operativo">
              <select style={adminStyles.select} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {STAFF_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </Field>
            <Field label="Teléfono" hint="Para WhatsApp de mesa lista y reservas"><input style={adminStyles.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+57 300…" /></Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
