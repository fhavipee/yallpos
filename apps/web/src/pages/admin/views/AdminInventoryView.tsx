import { useEffect, useState } from "react";
import { api, formatCOP } from "../../../lib/api";
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
  IdChip,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type Warehouse = { id: string; name: string; isDefault: boolean; isActive: boolean };
type StockRow = {
  id: string;
  variantId: string;
  quantity: string;
  reserved: string;
  variant?: { price?: string; sku?: string; barcode?: string; product?: { name: string } };
};

export default function AdminInventoryView() {
  const runAction = useAdminAction();
  const [warehouseId, setWarehouseId] = useState("");
  const [stock, setStock] = useState<StockRow[]>([]);
  const [whModal, setWhModal] = useState<"new" | Warehouse | null>(null);
  const [whName, setWhName] = useState("");
  const [whDefault, setWhDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const w = await api.get("/v1/admin/warehouses");
    return w.data as Warehouse[];
  }, []);

  const warehouses = data ?? [];
  const activeWarehouses = warehouses.filter((w) => w.isActive);

  useEffect(() => {
    if (!activeWarehouses.length) return;
    const def = activeWarehouses.find((w) => w.isDefault)?.id || activeWarehouses[0].id;
    setWarehouseId((prev) => prev || def);
  }, [activeWarehouses]);

  useEffect(() => {
    if (!warehouseId) return;
    api.get("/v1/admin/stock", { params: { warehouseId } }).then((r) => setStock(r.data));
  }, [warehouseId]);

  async function refreshStock() {
    if (!warehouseId) return;
    const s = await api.get("/v1/admin/stock", { params: { warehouseId } });
    setStock(s.data);
  }

  async function saveWarehouse() {
    setSaving(true);
    await runAction(async () => {
      const body = { name: whName, isDefault: whDefault };
      if (whModal === "new") await api.post("/v1/admin/warehouses", body);
      else if (whModal) await api.patch(`/v1/admin/warehouses/${whModal.id}`, body);
      setWhModal(null);
      await reload();
    }, "Bodega guardada");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="Inventario" desc="Bodegas y niveles de stock por variante de producto." actions={<ReloadButton onClick={reload} />} />

        <AdminSection title={`Bodegas (${activeWarehouses.length})`} actions={
          <button type="button" style={adminStyles.btnPrimary} onClick={() => { setWhName(""); setWhDefault(false); setWhModal("new"); }}>+ Bodega</button>
        }>
          {activeWarehouses.length === 0 ? (
            <EmptyState text="Sin bodegas — se crea una default en el onboarding." />
          ) : (
            <table style={adminStyles.table}>
              <thead><tr><th style={adminStyles.th}>Nombre</th><th style={adminStyles.th}>Principal</th><th style={adminStyles.th}>Estado</th><th style={adminStyles.th}></th></tr></thead>
              <tbody>
                {activeWarehouses.map((w) => (
                  <tr key={w.id} style={w.id === warehouseId ? { background: "var(--t-card-alt)" } : undefined}>
                    <td style={adminStyles.td}><strong>{w.name}</strong> <IdChip id={w.id} /></td>
                    <td style={adminStyles.td}>{w.isDefault ? "✓ Default" : "—"}</td>
                    <td style={adminStyles.td}><Badge ok={w.isActive} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => setWarehouseId(w.id)}>Ver stock</button>{" "}
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => { setWhName(w.name); setWhDefault(w.isDefault); setWhModal(w); }}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        <AdminSection title={`Stock — ${warehouses.find((w) => w.id === warehouseId)?.name ?? "bodega"}`} desc="Ajuste manual de cantidades. Las ventas descuentan automáticamente.">
          {stock.length === 0 ? (
            <EmptyState text="Sin niveles de stock en esta bodega." />
          ) : (
            <table style={adminStyles.table}>
              <thead><tr><th style={adminStyles.th}>Producto</th><th style={adminStyles.th}>SKU</th><th style={adminStyles.th}>Cantidad</th><th style={adminStyles.th}>Reservado</th><th style={adminStyles.th}>Precio</th><th style={adminStyles.th}></th></tr></thead>
              <tbody>
                {stock.map((s) => (
                  <StockRowEditor key={s.id} row={s} onSave={async (qty) => {
                    await runAction(async () => {
                      await api.patch("/v1/admin/stock", { warehouseId, variantId: s.variantId, quantity: qty });
                      await refreshStock();
                    }, "Stock actualizado");
                  }} />
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {whModal && (
          <AdminModal title={whModal === "new" ? "Nueva bodega" : "Editar bodega"} onClose={() => setWhModal(null)} footer={
            <ModalFooter onCancel={() => setWhModal(null)} onSave={saveWarehouse} saving={saving} disabled={!whName.trim()} />
          }>
            <Field label="Nombre"><input style={adminStyles.input} value={whName} onChange={(e) => setWhName(e.target.value)} /></Field>
            <CheckboxField label="Bodega principal (default)" checked={whDefault} onChange={setWhDefault} />
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}

function StockRowEditor({ row, onSave }: { row: StockRow; onSave: (q: number) => Promise<void> }) {
  const [qty, setQty] = useState(String(Number(row.quantity)));
  const [saving, setSaving] = useState(false);
  return (
    <tr>
      <td style={adminStyles.td}>{row.variant?.product?.name ?? "—"}</td>
      <td style={adminStyles.td}>{row.variant?.sku ?? row.variant?.barcode ?? "—"}</td>
      <td style={adminStyles.td}><input type="number" style={{ ...adminStyles.input, width: 90 }} value={qty} onChange={(e) => setQty(e.target.value)} /></td>
      <td style={adminStyles.td}>{Number(row.reserved)}</td>
      <td style={adminStyles.td}>{formatCOP(Number(row.variant?.price ?? 0))}</td>
      <td style={adminStyles.td}>
        <button type="button" style={adminStyles.btnSecondary} disabled={saving} onClick={async () => { setSaving(true); await onSave(Number(qty)); setSaving(false); }}>
          {saving ? "…" : "Guardar"}
        </button>
      </td>
    </tr>
  );
}
