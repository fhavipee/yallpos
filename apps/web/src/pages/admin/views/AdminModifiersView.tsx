import { useState } from "react";
import { api, formatCOP } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminModal,
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  EmptyState,
  Field,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type Product = { id: string; name: string; isActive: boolean };
type ModifierGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isActive: boolean;
  options?: { id: string; name: string; priceDelta: string; isActive: boolean }[];
  products?: { productId: string; product?: { id: string; name: string } }[];
};

export default function AdminModifiersView() {
  const runAction = useAdminAction();
  const [groupModal, setGroupModal] = useState<"new" | ModifierGroup | null>(null);
  const [optionModal, setOptionModal] = useState<ModifierGroup | null>(null);
  const [linkModal, setLinkModal] = useState<ModifierGroup | null>(null);
  const [gForm, setGForm] = useState({ name: "", minSelect: 0, maxSelect: 1 });
  const [oForm, setOForm] = useState({ name: "", priceDelta: "0" });
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [g, p] = await Promise.all([
      api.get("/v1/admin/modifier-groups"),
      api.get("/v1/catalog/products", { params: { all: "1" } }),
    ]);
    return { groups: g.data as ModifierGroup[], products: p.data as Product[] };
  }, []);

  const groups = (data?.groups ?? []).filter((g) => g.isActive);
  const products = data?.products ?? [];

  function openLinkModal(g: ModifierGroup) {
    setSelectedProductIds((g.products ?? []).map((pm) => pm.productId ?? pm.product?.id).filter(Boolean) as string[]);
    setProductSearch("");
    setLinkModal(g);
  }

  const filteredProducts = products.filter((p) => {
    if (!p.isActive) return false;
    const q = productSearch.toLowerCase();
    return !q || p.name.toLowerCase().includes(q);
  });

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="Modificadores" desc="Extras configurables (sin cebolla, término carne, adiciones con precio)." actions={
          <>
            <ReloadButton onClick={reload} />
            <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={() => { setGForm({ name: "", minSelect: 0, maxSelect: 1 }); setGroupModal("new"); }}>+ Grupo</button>
          </>
        } />

        {groups.length === 0 ? (
          <AdminSection title="Grupos">
            <EmptyState text="Sin grupos de modificadores — crea extras para personalizar pedidos." />
          </AdminSection>
        ) : (
          groups.map((g) => (
            <AdminSection key={g.id} title={g.name} desc={`Selección: ${g.minSelect}–${g.maxSelect}`} actions={
              <button type="button" style={adminStyles.btnSecondary} onClick={() => { setOForm({ name: "", priceDelta: "0" }); setOptionModal(g); }}>+ Opción</button>
            }>
              <div style={{ marginBottom: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button type="button" style={adminStyles.btnSecondary} onClick={() => { setGForm({ name: g.name, minSelect: g.minSelect, maxSelect: g.maxSelect }); setGroupModal(g); }}>Editar grupo</button>
                <button type="button" style={adminStyles.btnSecondary} onClick={() => openLinkModal(g)}>Vincular productos ({g.products?.length ?? 0})</button>
                <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                  await runAction(async () => { await api.delete(`/v1/admin/modifier-groups/${g.id}`); await reload(); }, "Grupo desactivado");
                }}>Desactivar</button>
              </div>
              {(g.options ?? []).filter((o) => o.isActive).length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--t-muted)" }}>Sin opciones activas.</p>
              ) : (
                <table style={adminStyles.table}>
                  <thead><tr><th style={adminStyles.th}>Opción</th><th style={adminStyles.th}>Precio adicional</th><th style={adminStyles.th}></th></tr></thead>
                  <tbody>
                    {(g.options ?? []).filter((o) => o.isActive).map((o) => (
                      <tr key={o.id}>
                        <td style={adminStyles.td}>{o.name}</td>
                        <td style={adminStyles.td}>{formatCOP(Number(o.priceDelta))}</td>
                        <td style={adminStyles.td}>
                          <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                            await runAction(async () => { await api.delete(`/v1/admin/modifier-options/${o.id}`); await reload(); }, "Opción eliminada");
                          }}>×</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {(g.products ?? []).length > 0 ? (
                <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 8 }}>
                  Vinculado a: {(g.products ?? []).map((pm) => pm.product?.name ?? pm.productId.slice(0, 8)).join(", ")}
                </p>
              ) : (
                <p style={{ fontSize: 12, color: "#b45309", marginTop: 8 }}>Sin productos vinculados — no aparecerá en el POS</p>
              )}
            </AdminSection>
          ))
        )}

        {groupModal && (
          <AdminModal title={groupModal === "new" ? "Nuevo grupo" : "Editar grupo"} onClose={() => setGroupModal(null)} footer={
            <ModalFooter onCancel={() => setGroupModal(null)} onSave={async () => {
              setSaving(true);
              const body = { name: gForm.name, minSelect: gForm.minSelect, maxSelect: gForm.maxSelect };
              await runAction(async () => {
                if (groupModal === "new") await api.post("/v1/admin/modifier-groups", body);
                else await api.patch(`/v1/admin/modifier-groups/${groupModal.id}`, body);
                setGroupModal(null);
                await reload();
              }, "Grupo guardado");
              setSaving(false);
            }} saving={saving} disabled={!gForm.name.trim()} />
          }>
            <Field label="Nombre"><input style={adminStyles.input} value={gForm.name} onChange={(e) => setGForm({ ...gForm, name: e.target.value })} /></Field>
            <div style={adminStyles.grid2}>
              <Field label="Mínimo a elegir"><input type="number" min={0} style={adminStyles.input} value={gForm.minSelect} onChange={(e) => setGForm({ ...gForm, minSelect: Number(e.target.value) })} /></Field>
              <Field label="Máximo a elegir"><input type="number" min={0} style={adminStyles.input} value={gForm.maxSelect} onChange={(e) => setGForm({ ...gForm, maxSelect: Number(e.target.value) })} /></Field>
            </div>
          </AdminModal>
        )}

        {optionModal && (
          <AdminModal title={`Opción — ${optionModal.name}`} onClose={() => setOptionModal(null)} footer={
            <ModalFooter onCancel={() => setOptionModal(null)} onSave={async () => {
              setSaving(true);
              await runAction(async () => {
                await api.post(`/v1/admin/modifier-groups/${optionModal.id}/options`, { name: oForm.name, priceDelta: Number(oForm.priceDelta) });
                setOptionModal(null);
                await reload();
              }, "Opción creada");
              setSaving(false);
            }} saving={saving} saveLabel="Agregar" disabled={!oForm.name.trim()} />
          }>
            <Field label="Nombre opción"><input style={adminStyles.input} value={oForm.name} onChange={(e) => setOForm({ ...oForm, name: e.target.value })} /></Field>
            <Field label="Precio adicional"><input type="number" style={adminStyles.input} value={oForm.priceDelta} onChange={(e) => setOForm({ ...oForm, priceDelta: e.target.value })} /></Field>
          </AdminModal>
        )}

        {linkModal && (
          <AdminModal title={`Productos — ${linkModal.name}`} onClose={() => setLinkModal(null)} footer={
            <ModalFooter onCancel={() => setLinkModal(null)} onSave={async () => {
              setSaving(true);
              await runAction(async () => {
                await api.patch(`/v1/admin/modifier-groups/${linkModal.id}`, { productIds: selectedProductIds });
                setLinkModal(null);
                await reload();
              }, `${selectedProductIds.length} producto(s) vinculados`);
              setSaving(false);
            }} saving={saving} saveLabel="Guardar vínculos" />
          }>
            <Field label="Buscar producto">
              <input style={adminStyles.input} placeholder="Filtrar por nombre…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} />
            </Field>
            <div style={{ maxHeight: 320, overflow: "auto", border: "1px solid var(--t-border)", borderRadius: 8, padding: 8 }}>
              {filteredProducts.map((p) => (
                <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 4px", fontSize: 13, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={selectedProductIds.includes(p.id)}
                    onChange={(e) => {
                      setSelectedProductIds((prev) =>
                        e.target.checked ? [...prev, p.id] : prev.filter((id) => id !== p.id),
                      );
                    }}
                  />
                  {p.name}
                </label>
              ))}
              {filteredProducts.length === 0 && <p style={{ color: "var(--t-muted)", fontSize: 13, margin: 8 }}>Sin resultados</p>}
            </div>
            <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 8 }}>{selectedProductIds.length} seleccionado(s)</p>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
