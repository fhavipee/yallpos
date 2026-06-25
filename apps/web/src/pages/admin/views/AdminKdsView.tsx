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
import { COURSES } from "../types";

type Station = { id: string; name: string; isActive: boolean };
type Routing = { id: string; stationId: string; course?: string; variantId?: string; station?: { name: string } };
type Product = { id: string; name: string; isActive: boolean; variants: { id: string; name: string }[] };

export default function AdminKdsView() {
  const runAction = useAdminAction();
  const [stationModal, setStationModal] = useState<"new" | Station | null>(null);
  const [routeModal, setRouteModal] = useState(false);
  const [stationName, setStationName] = useState("");
  const [routeForm, setRouteForm] = useState({ stationId: "", course: "main", variantId: "" });
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [s, r, p] = await Promise.all([
      api.get("/v1/admin/kds/stations"),
      api.get("/v1/admin/kds/routing-rules"),
      api.get("/v1/catalog/products", { params: { all: "1" } }),
    ]);
    const stations = s.data as Station[];
    if (stations[0]) setRouteForm((f) => ({ ...f, stationId: f.stationId || stations[0].id }));
    return {
      stations,
      routing: r.data as Routing[],
      products: p.data as Product[],
    };
  }, []);

  const stations = data?.stations ?? [];
  const routing = data?.routing ?? [];
  const products = data?.products ?? [];
  const activeStations = stations.filter((s) => s.isActive);

  const variantOptions = useMemo(() => {
    return products
      .filter((p) => p.isActive)
      .flatMap((p) => (p.variants ?? []).map((v) => ({ id: v.id, label: `${p.name}${v.name !== p.name ? ` — ${v.name}` : ""}` })));
  }, [products]);

  const courseLabel = (v?: string) => COURSES.find((c) => c.value === v)?.label ?? v ?? "—";

  async function saveStation() {
    setSaving(true);
    await runAction(async () => {
      if (stationModal === "new") await api.post("/v1/admin/kds/stations", { name: stationName });
      else if (stationModal) await api.patch(`/v1/admin/kds/stations/${stationModal.id}`, { name: stationName });
      setStationModal(null);
      await reload();
    }, "Estación guardada");
    setSaving(false);
  }

  async function saveRoute() {
    setSaving(true);
    await runAction(async () => {
      await api.post("/v1/admin/kds/routing-rules", {
        stationId: routeForm.stationId,
        course: routeForm.course,
        variantId: routeForm.variantId || undefined,
      });
      setRouteModal(false);
      await reload();
    }, "Regla creada");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="KDS — Cocina" desc="Estaciones de pantalla y reglas que envían ítems según curso o producto." actions={<ReloadButton onClick={reload} />} />

        <AdminSection title={`Estaciones (${activeStations.length})`} actions={
          <button type="button" style={adminStyles.btnPrimary} onClick={() => { setStationName(""); setStationModal("new"); }}>+ Estación</button>
        }>
          {activeStations.length === 0 ? (
            <EmptyState text="Crea estaciones como Cocina, Barra o Repostería." />
          ) : (
            <table style={adminStyles.table}>
              <thead><tr><th style={adminStyles.th}>Nombre</th><th style={adminStyles.th}>Estado</th><th style={adminStyles.th}>ID</th><th style={adminStyles.th}></th></tr></thead>
              <tbody>
                {activeStations.map((s) => (
                  <tr key={s.id}>
                    <td style={adminStyles.td}><strong>{s.name}</strong></td>
                    <td style={adminStyles.td}><Badge ok={s.isActive} /></td>
                    <td style={adminStyles.td}><IdChip id={s.id} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setStationName(s.name); setStationModal(s); }}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/kds/stations/${s.id}`); await reload(); }, "Estación desactivada");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        <AdminSection title={`Reglas de enrutamiento (${routing.length})`} desc="Define qué curso va a qué estación (Cocina, Barra…)." actions={
          <button type="button" style={adminStyles.btnPrimary} disabled={!activeStations.length} onClick={() => setRouteModal(true)}>+ Regla</button>
        }>
          {routing.length === 0 ? (
            <EmptyState text="Sin reglas — los ítems no llegarán al KDS hasta configurar enrutamiento." />
          ) : (
            <table style={adminStyles.table}>
              <thead><tr><th style={adminStyles.th}>Estación</th><th style={adminStyles.th}>Curso</th><th style={adminStyles.th}>Producto</th><th style={adminStyles.th}></th></tr></thead>
              <tbody>
                {routing.map((r) => (
                  <tr key={r.id}>
                    <td style={adminStyles.td}>{r.station?.name}</td>
                    <td style={adminStyles.td}>{courseLabel(r.course)}</td>
                    <td style={adminStyles.td}>
                      {r.variantId
                        ? variantOptions.find((v) => v.id === r.variantId)?.label ?? <IdChip id={r.variantId} />
                        : "Todos del curso"}
                    </td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => { await api.delete(`/v1/admin/kds/routing-rules/${r.id}`); await reload(); }, "Regla eliminada");
                      }}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {stationModal && (
          <AdminModal title={stationModal === "new" ? "Nueva estación" : "Editar estación"} onClose={() => setStationModal(null)} footer={
            <ModalFooter onCancel={() => setStationModal(null)} onSave={saveStation} saving={saving} disabled={!stationName.trim()} />
          }>
            <Field label="Nombre"><input style={adminStyles.input} value={stationName} onChange={(e) => setStationName(e.target.value)} placeholder="Cocina, Barra…" /></Field>
          </AdminModal>
        )}

        {routeModal && (
          <AdminModal title="Nueva regla" onClose={() => setRouteModal(false)} footer={
            <ModalFooter onCancel={() => setRouteModal(false)} onSave={saveRoute} saving={saving} saveLabel="Crear" disabled={!routeForm.stationId} />
          }>
            <Field label="Estación">
              <select style={adminStyles.select} value={routeForm.stationId} onChange={(e) => setRouteForm({ ...routeForm, stationId: e.target.value })}>
                {activeStations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Curso del producto">
              <select style={adminStyles.select} value={routeForm.course} onChange={(e) => setRouteForm({ ...routeForm, course: e.target.value })}>
                {COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Producto específico (opcional)" hint="Si se deja vacío, aplica a todo el curso">
              <select style={adminStyles.select} value={routeForm.variantId} onChange={(e) => setRouteForm({ ...routeForm, variantId: e.target.value })}>
                <option value="">— Todos del curso —</option>
                {variantOptions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
              </select>
            </Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
