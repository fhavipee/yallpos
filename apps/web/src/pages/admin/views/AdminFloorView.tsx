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

type Area = { id: string; name: string; isActive: boolean };
type Table = { id: string; name: string; diningAreaId: string; capacity?: number; isActive: boolean; area?: { name: string } };

export default function AdminFloorView() {
  const runAction = useAdminAction();
  const [areaModal, setAreaModal] = useState<"new" | Area | null>(null);
  const [tableModal, setTableModal] = useState<"new" | Table | null>(null);
  const [bulkModal, setBulkModal] = useState(false);
  const [areaForm, setAreaForm] = useState({ name: "" });
  const [tableForm, setTableForm] = useState({ name: "", diningAreaId: "", capacity: 4 });
  const [bulkForm, setBulkForm] = useState({ prefix: "M", from: 1, to: 10, diningAreaId: "", capacity: 4 });
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [a, t] = await Promise.all([api.get("/v1/admin/areas"), api.get("/v1/admin/tables")]);
    return { areas: a.data as Area[], tables: t.data as Table[] };
  }, []);

  const areas = data?.areas ?? [];
  const tables = data?.tables ?? [];
  const activeAreas = areas.filter((a) => a.isActive);
  const activeTables = tables.filter((t) => t.isActive);

  async function saveArea() {
    setSaving(true);
    await runAction(async () => {
      if (areaModal === "new") await api.post("/v1/admin/areas", areaForm);
      else if (areaModal) await api.patch(`/v1/admin/areas/${areaModal.id}`, areaForm);
      setAreaModal(null);
      await reload();
    }, "Área guardada");
    setSaving(false);
  }

  async function saveTable() {
    setSaving(true);
    await runAction(async () => {
      if (tableModal === "new") await api.post("/v1/admin/tables", tableForm);
      else if (tableModal) await api.patch(`/v1/admin/tables/${tableModal.id}`, tableForm);
      setTableModal(null);
      await reload();
    }, "Mesa guardada");
    setSaving(false);
  }

  async function bulkCreate() {
    setSaving(true);
    await runAction(async () => {
      for (let i = bulkForm.from; i <= bulkForm.to; i++) {
        await api.post("/v1/admin/tables", {
          name: `${bulkForm.prefix}${i}`,
          diningAreaId: bulkForm.diningAreaId,
          capacity: bulkForm.capacity,
        });
      }
      setBulkModal(false);
      await reload();
    }, `Mesas ${bulkForm.prefix}${bulkForm.from}–${bulkForm.prefix}${bulkForm.to} creadas`);
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="Mesas y áreas" desc="Layout del salón. Cada mesa pertenece a un área (Salón, Terraza, VIP…)." actions={<ReloadButton onClick={reload} />} />

        <AdminSection
          title={`Áreas (${activeAreas.length})`}
          actions={
            <button type="button" style={adminStyles.btnPrimary} onClick={() => { setAreaForm({ name: "" }); setAreaModal("new"); }}>
              + Área
            </button>
          }
        >
          {activeAreas.length === 0 ? (
            <EmptyState text="Crea al menos un área antes de agregar mesas." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Nombre</th>
                  <th style={adminStyles.th}>Mesas</th>
                  <th style={adminStyles.th}>ID</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {activeAreas.map((a) => (
                  <tr key={a.id}>
                    <td style={adminStyles.td}><strong>{a.name}</strong></td>
                    <td style={adminStyles.td}>{activeTables.filter((t) => t.diningAreaId === a.id).length}</td>
                    <td style={adminStyles.td}><IdChip id={a.id} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setAreaForm({ name: a.name }); setAreaModal(a); }}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        if (!window.confirm(`¿Desactivar área "${a.name}"?`)) return;
                        await runAction(async () => { await api.delete(`/v1/admin/areas/${a.id}`); await reload(); }, "Área desactivada");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        <AdminSection
          title={`Mesas (${activeTables.length})`}
          actions={
            <>
              <button
                type="button"
                style={adminStyles.btnSecondary}
                disabled={!activeAreas.length}
                onClick={() => {
                  setBulkForm({ prefix: "M", from: 1, to: 10, diningAreaId: activeAreas[0]?.id ?? "", capacity: 4 });
                  setBulkModal(true);
                }}
              >
                Crear lote
              </button>
              <button
                type="button"
                style={{ ...adminStyles.btnPrimary, marginLeft: 8 }}
                disabled={!activeAreas.length}
                onClick={() => {
                  setTableForm({ name: "", diningAreaId: activeAreas[0]?.id ?? "", capacity: 4 });
                  setTableModal("new");
                }}
              >
                + Mesa
              </button>
            </>
          }
        >
          {activeTables.length === 0 ? (
            <EmptyState text="Sin mesas — crea mesas individuales o en lote." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Mesa</th>
                  <th style={adminStyles.th}>Área</th>
                  <th style={adminStyles.th}>Capacidad</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {activeTables.map((t) => (
                  <tr key={t.id}>
                    <td style={adminStyles.td}><strong>{t.name}</strong></td>
                    <td style={adminStyles.td}>{t.area?.name ?? "—"}</td>
                    <td style={adminStyles.td}>{t.capacity ?? "—"} pax</td>
                    <td style={adminStyles.td}><Badge ok={t.isActive} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setTableForm({ name: t.name, diningAreaId: t.diningAreaId, capacity: t.capacity ?? 4 }); setTableModal(t); }}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/tables/${t.id}`); await reload(); }, "Mesa desactivada");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {areaModal && (
          <AdminModal title={areaModal === "new" ? "Nueva área" : "Editar área"} onClose={() => setAreaModal(null)} footer={
            <ModalFooter onCancel={() => setAreaModal(null)} onSave={saveArea} saving={saving} disabled={!areaForm.name.trim()} />
          }>
            <Field label="Nombre del área"><input style={adminStyles.input} value={areaForm.name} onChange={(e) => setAreaForm({ name: e.target.value })} placeholder="Salón, Terraza…" /></Field>
          </AdminModal>
        )}

        {tableModal && (
          <AdminModal title={tableModal === "new" ? "Nueva mesa" : "Editar mesa"} onClose={() => setTableModal(null)} footer={
            <ModalFooter onCancel={() => setTableModal(null)} onSave={saveTable} saving={saving} disabled={!tableForm.name.trim() || !tableForm.diningAreaId} />
          }>
            <Field label="Nombre"><input style={adminStyles.input} value={tableForm.name} onChange={(e) => setTableForm({ ...tableForm, name: e.target.value })} placeholder="M1, T2…" /></Field>
            <Field label="Área">
              <select style={adminStyles.select} value={tableForm.diningAreaId} onChange={(e) => setTableForm({ ...tableForm, diningAreaId: e.target.value })}>
                {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Capacidad (personas)"><input type="number" min={1} style={adminStyles.input} value={tableForm.capacity} onChange={(e) => setTableForm({ ...tableForm, capacity: Number(e.target.value) })} /></Field>
          </AdminModal>
        )}

        {bulkModal && (
          <AdminModal title="Crear mesas en lote" onClose={() => setBulkModal(false)} footer={
            <ModalFooter onCancel={() => setBulkModal(false)} onSave={bulkCreate} saving={saving} saveLabel="Crear mesas" disabled={!bulkForm.diningAreaId || bulkForm.to < bulkForm.from} />
          }>
            <Field label="Prefijo"><input style={adminStyles.input} value={bulkForm.prefix} onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })} placeholder="M" /></Field>
            <div style={adminStyles.grid2}>
              <Field label="Desde número"><input type="number" style={adminStyles.input} value={bulkForm.from} onChange={(e) => setBulkForm({ ...bulkForm, from: Number(e.target.value) })} /></Field>
              <Field label="Hasta número"><input type="number" style={adminStyles.input} value={bulkForm.to} onChange={(e) => setBulkForm({ ...bulkForm, to: Number(e.target.value) })} /></Field>
            </div>
            <Field label="Área">
              <select style={adminStyles.select} value={bulkForm.diningAreaId} onChange={(e) => setBulkForm({ ...bulkForm, diningAreaId: e.target.value })}>
                {activeAreas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Capacidad por mesa"><input type="number" min={1} style={adminStyles.input} value={bulkForm.capacity} onChange={(e) => setBulkForm({ ...bulkForm, capacity: Number(e.target.value) })} /></Field>
            <p style={{ fontSize: 12, color: "var(--t-muted)" }}>Se crearán: {bulkForm.prefix}{bulkForm.from} … {bulkForm.prefix}{bulkForm.to}</p>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
