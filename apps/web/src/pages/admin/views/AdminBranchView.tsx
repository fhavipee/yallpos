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
  CheckboxField,
  Field,
  IdChip,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";
import { BRANCH_TYPES, TIMEZONES } from "../types";

type Branch = {
  id: string;
  name: string;
  companyId: string;
  address?: string;
  timezone?: string;
  type: string;
  isActive: boolean;
};

export default function AdminBranchView() {
  const { companyId } = useAdmin();
  const runAction = useAdminAction();
  const [form, setForm] = useState({ name: "", address: "", timezone: "America/Bogota", type: "restaurant", isActive: true });
  const [saving, setSaving] = useState(false);
  const [newBranchModal, setNewBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [creatingBranch, setCreatingBranch] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [branchRes, branchesRes] = await Promise.all([
      api.get("/v1/admin/branch"),
      api.get("/v1/restaurant/branches").catch(() => ({ data: [] })),
    ]);
    const branch = branchRes.data as Branch;
    setForm({
      name: branch.name ?? "",
      address: branch.address ?? "",
      timezone: branch.timezone ?? "America/Bogota",
      type: branch.type ?? "restaurant",
      isActive: branch.isActive !== false,
    });
    return { branch, allBranches: branchesRes.data as Branch[] };
  }, []);

  async function save() {
    setSaving(true);
    const ok = await runAction(async () => {
      await api.patch("/v1/admin/branch", form);
      await reload();
    }, "Sucursal guardada");
    setSaving(false);
    if (!ok) return;
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload} loadingText="Cargando sucursal…">
      {data && (
        <>
          <AdminPageHeader
            title="Sucursal"
            desc="Datos de la sede operativa. Afecta reportes, KDS e impresión."
            actions={<ReloadButton onClick={reload} />}
          />

          <AdminSection title="Identificación">
            <div style={{ marginBottom: 16, fontSize: 13, color: "var(--t-muted)" }}>
              ID sucursal: <IdChip id={data.branch.id} /> · Empresa: <IdChip id={data.branch.companyId} />
            </div>
            <div className={adminStyles.grid2}>
              <Field label="Nombre comercial" hint="Aparece en tiquetes, KDS y pantallas de mesero">
                <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Tipo de negocio">
                <select style={adminStyles.select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {BRANCH_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Dirección">
                <input style={adminStyles.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </Field>
              <Field label="Zona horaria" hint="Usada en reservas y reportes">
                <select style={adminStyles.select} value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}>
                  {TIMEZONES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
            </div>
            <CheckboxField label="Sucursal activa" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
            <div style={{ marginTop: 16 }}>
              <button type="button" style={adminStyles.btnPrimary} disabled={saving || !form.name.trim()} onClick={save}>
                {saving ? "Guardando…" : "Guardar sucursal"}
              </button>
            </div>
          </AdminSection>

          {companyId && (
            <AdminSection title="Multi-sucursal" desc="Sedes del tenant. Cambia la sucursal activa desde el selector del header.">
              {data.allBranches.length > 0 && (
                <table style={{ ...adminStyles.table, marginBottom: 16 }}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Nombre</th>
                      <th style={adminStyles.th}>Tipo</th>
                      <th style={adminStyles.th}>Estado</th>
                      <th style={adminStyles.th}>ID</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.allBranches.map((b) => (
                      <tr key={b.id} style={b.id === data.branch.id ? { background: "var(--t-card-alt)" } : undefined}>
                        <td style={adminStyles.td}>
                          <strong>{b.name}</strong>
                          {b.id === data.branch.id && <span style={{ fontSize: 11, color: "#2563eb", marginLeft: 8 }}>Actual</span>}
                        </td>
                        <td style={adminStyles.td}>{b.type}</td>
                        <td style={adminStyles.td}>{b.isActive ? "Activa" : "Inactiva"}</td>
                        <td style={adminStyles.td}><IdChip id={b.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button type="button" style={adminStyles.btnSecondary} onClick={() => { setNewBranchName(""); setNewBranchModal(true); }}>
                + Nueva sucursal
              </button>
            </AdminSection>
          )}

          {newBranchModal && (
            <AdminModal title="Nueva sucursal" onClose={() => setNewBranchModal(false)} footer={
              <ModalFooter
                onCancel={() => setNewBranchModal(false)}
                onSave={async () => {
                  setCreatingBranch(true);
                  await runAction(async () => {
                    await api.post("/v1/admin/branches", { companyId, name: newBranchName.trim(), type: "restaurant" });
                    setNewBranchModal(false);
                    await reload();
                  }, "Sucursal creada — selecciónala en el header");
                  setCreatingBranch(false);
                }}
                saveLabel="Crear sucursal"
                saving={creatingBranch}
                disabled={!newBranchName.trim()}
              />
            }>
              <Field label="Nombre" hint="Se crea con bodega, caja y mesas base">
                <input style={adminStyles.input} value={newBranchName} onChange={(e) => setNewBranchName(e.target.value)} placeholder="Sucursal Norte…" />
              </Field>
            </AdminModal>
          )}
        </>
      )}
    </AdminViewGate>
  );
}
