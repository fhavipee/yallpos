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

type Register = { id: string; name: string; isActive: boolean };

export default function AdminCashView() {
  const runAction = useAdminAction();
  const [modal, setModal] = useState<"new" | Register | null>(null);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: registers, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/cash-registers");
    return r.data as Register[];
  }, []);

  const active = (registers ?? []).filter((r) => r.isActive);

  async function save() {
    setSaving(true);
    await runAction(async () => {
      if (modal === "new") await api.post("/v1/admin/cash-registers", { name });
      else if (modal) await api.patch(`/v1/admin/cash-registers/${modal.id}`, { name });
      setModal(null);
      await reload();
    }, "Caja guardada");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Cajas registradoras"
          desc="Puntos de cobro vinculados a sesiones de caja y reporte X."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={() => { setName(""); setModal("new"); }}>+ Caja</button>
            </>
          }
        />

        <AdminSection title={`Cajas configuradas (${active.length})`}>
          {active.length === 0 ? (
            <EmptyState text="Sin cajas — crea al menos una para abrir turno de caja." />
          ) : (
            <table style={adminStyles.table}>
              <thead><tr><th style={adminStyles.th}>Nombre</th><th style={adminStyles.th}>Estado</th><th style={adminStyles.th}>ID</th><th style={adminStyles.th}></th></tr></thead>
              <tbody>
                {active.map((r) => (
                  <tr key={r.id}>
                    <td style={adminStyles.td}><strong>{r.name}</strong></td>
                    <td style={adminStyles.td}><Badge ok={r.isActive} /></td>
                    <td style={adminStyles.td}><IdChip id={r.id} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setName(r.name); setModal(r); }}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/cash-registers/${r.id}`); await reload(); }, "Caja desactivada");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal title={modal === "new" ? "Nueva caja" : "Editar caja"} onClose={() => setModal(null)} footer={
            <ModalFooter onCancel={() => setModal(null)} onSave={save} saving={saving} disabled={!name.trim()} />
          }>
            <Field label="Nombre visible"><input style={adminStyles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Caja 1, Caja principal…" /></Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
