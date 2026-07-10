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

type Station = {
  id: string;
  name: string;
  isActive: boolean;
  printerIp?: string | null;
  printerPort?: number | null;
  printerName?: string | null;
};
type Routing = { id: string; stationId: string; course?: string; variantId?: string; station?: { name: string } };
type Product = { id: string; name: string; isActive: boolean; variants: { id: string; name: string }[] };

const emptyStationForm = {
  name: "",
  printerIp: "",
  printerPort: "9100",
  printerName: "",
};

export default function AdminKdsView() {
  const runAction = useAdminAction();
  const [stationModal, setStationModal] = useState<"new" | Station | null>(null);
  const [routeModal, setRouteModal] = useState(false);
  const [stationForm, setStationForm] = useState(emptyStationForm);
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

  function openNewStation() {
    setStationForm(emptyStationForm);
    setStationModal("new");
  }

  function openEditStation(s: Station) {
    setStationForm({
      name: s.name,
      printerIp: s.printerIp ?? "",
      printerPort: String(s.printerPort ?? 9100),
      printerName: s.printerName ?? "",
    });
    setStationModal(s);
  }

  async function saveStation() {
    setSaving(true);
    await runAction(async () => {
      const payload = {
        name: stationForm.name.trim(),
        printerIp: stationForm.printerIp.trim() || undefined,
        printerPort: Number(stationForm.printerPort) || 9100,
        printerName: stationForm.printerName.trim() || undefined,
      };
      if (stationModal === "new") await api.post("/v1/admin/kds/stations", payload);
      else if (stationModal) await api.patch(`/v1/admin/kds/stations/${stationModal.id}`, payload);
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
        <AdminPageHeader
          title="KDS — Cocina y barras"
          desc="Estaciones, impresoras (local o remota) y reglas: sushi → sushi-bar, jugos/cócteles → bar."
          actions={<ReloadButton onClick={reload} />}
        />

        <AdminSection title={`Estaciones e impresoras (${activeStations.length})`} actions={
          <button type="button" style={adminStyles.btnPrimary} onClick={openNewStation}>+ Estación</button>
        }>
          <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
            Cada estación puede tener su impresora térmica (IP de red, ej. <code>192.168.1.50</code>).
            El print-agent en la caja envía el ticket a esa IP. Sin IP, usa la impresora de cocina general de Configuración.
          </p>
          {activeStations.length === 0 ? (
            <EmptyState text="Crea estaciones como Cocina, Sushi-bar, Lobby bar…" />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Estación</th>
                  <th style={adminStyles.th}>Impresora</th>
                  <th style={adminStyles.th}>IP : puerto</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {activeStations.map((s) => (
                  <tr key={s.id}>
                    <td style={adminStyles.td}><strong>{s.name}</strong></td>
                    <td style={adminStyles.td}>{s.printerName || "—"}</td>
                    <td style={adminStyles.td}>
                      {s.printerIp
                        ? `${s.printerIp}:${s.printerPort ?? 9100}`
                        : <span style={{ color: "var(--t-muted)" }}>Cocina general</span>}
                    </td>
                    <td style={adminStyles.td}><Badge ok={s.isActive} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEditStation(s)}>Editar</button>{" "}
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

        <AdminSection title={`Reglas de enrutamiento (${routing.length})`} desc="Define qué curso o producto va a qué estación (y por tanto a qué impresora)." actions={
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
            <ModalFooter onCancel={() => setStationModal(null)} onSave={saveStation} saving={saving} disabled={!stationForm.name.trim()} />
          }>
            <Field label="Nombre de estación">
              <input
                style={adminStyles.input}
                value={stationForm.name}
                onChange={(e) => setStationForm({ ...stationForm, name: e.target.value })}
                placeholder="Sushi-bar, Lobby bar, Cocina…"
              />
            </Field>
            <Field label="Nombre de impresora (opcional)" hint="Solo etiqueta, ej. Epson TM-T20 Sushi">
              <input
                style={adminStyles.input}
                value={stationForm.printerName}
                onChange={(e) => setStationForm({ ...stationForm, printerName: e.target.value })}
                placeholder="Epson Sushi"
              />
            </Field>
            <Field label="IP de impresora" hint="Red local (192.168.x.x) o IP remota alcanzable desde el print-agent. Vacío = impresora cocina general.">
              <input
                style={adminStyles.input}
                value={stationForm.printerIp}
                onChange={(e) => setStationForm({ ...stationForm, printerIp: e.target.value.trim() })}
                placeholder="192.168.1.55"
              />
            </Field>
            <Field label="Puerto">
              <input
                style={adminStyles.input}
                value={stationForm.printerPort}
                onChange={(e) => setStationForm({ ...stationForm, printerPort: e.target.value.replace(/\D/g, "").slice(0, 5) })}
                placeholder="9100"
              />
            </Field>
          </AdminModal>
        )}

        {routeModal && (
          <AdminModal title="Nueva regla" onClose={() => setRouteModal(false)} footer={
            <ModalFooter onCancel={() => setRouteModal(false)} onSave={saveRoute} saving={saving} saveLabel="Crear" disabled={!routeForm.stationId} />
          }>
            <Field label="Estación">
              <select style={adminStyles.select} value={routeForm.stationId} onChange={(e) => setRouteForm({ ...routeForm, stationId: e.target.value })}>
                {activeStations.map((s) => <option key={s.id} value={s.id}>{s.name}{s.printerIp ? ` · ${s.printerIp}` : ""}</option>)}
              </select>
            </Field>
            <Field label="Curso del producto">
              <select style={adminStyles.select} value={routeForm.course} onChange={(e) => setRouteForm({ ...routeForm, course: e.target.value })}>
                {COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </Field>
            <Field label="Producto específico (opcional)" hint="Si se deja vacío, aplica a todo el curso. Usa producto para sushi concreto → Sushi-bar.">
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
