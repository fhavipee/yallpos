import { useMemo, useState } from "react";
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
import { COURSES, PRODUCT_TYPES, PRODUCT_UNITS, TAX_TYPES } from "../types";

type Product = {
  id: string;
  name: string;
  description?: string;
  type: string;
  taxType: string;
  course?: string;
  isActive: boolean;
  category?: { id: string; name: string };
  variants: { id: string; price: string; cost: string; barcode?: string; sku?: string; name: string; sellByWeight?: boolean; unit?: string }[];
};

type Category = { id: string; name: string };

const emptyForm = () => ({
  name: "",
  description: "",
  categoryId: "",
  type: "standard",
  taxType: "iva_19",
  course: "main",
  price: "",
  cost: "",
  barcode: "",
  sku: "",
  sellByWeight: false,
  unit: "und",
});

export default function AdminProductsView() {
  const runAction = useAdminAction();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [modal, setModal] = useState<"new" | Product | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [p, c] = await Promise.all([
      api.get("/v1/catalog/products", { params: { all: "1" } }),
      api.get("/v1/catalog/categories"),
    ]);
    return { products: p.data as Product[], categories: c.data as Category[] };
  }, []);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (categoryFilter && p.category?.id !== categoryFilter) return false;
      return !q || p.name.toLowerCase().includes(q) || p.variants[0]?.barcode?.includes(q) || p.variants[0]?.sku?.toLowerCase().includes(q);
    });
  }, [products, search, categoryFilter]);

  const taxLabel = (v: string) => TAX_TYPES.find((t) => t.value === v)?.label ?? v;
  const courseLabel = (v?: string) => COURSES.find((c) => c.value === v)?.label ?? v ?? "—";

  function openEdit(p: Product) {
    const v = p.variants[0];
    setForm({
      name: p.name,
      description: p.description ?? "",
      categoryId: p.category?.id ?? "",
      type: p.type,
      taxType: p.taxType,
      course: p.course ?? "main",
      price: String(v?.price ?? ""),
      cost: String(v?.cost ?? ""),
      barcode: v?.barcode ?? "",
      sku: v?.sku ?? "",
      sellByWeight: v?.sellByWeight ?? false,
      unit: v?.unit ?? "und",
    });
    setModal(p);
  }

  async function save() {
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description || undefined,
      categoryId: form.categoryId || undefined,
      type: form.type,
      taxType: form.taxType,
      course: form.course,
      price: Number(form.price),
      cost: Number(form.cost) || 0,
      barcode: form.barcode || undefined,
      sku: form.sku || undefined,
      sellByWeight: form.sellByWeight,
      unit: form.unit,
    };
    await runAction(async () => {
      if (modal === "new") await api.post("/v1/catalog/products", payload);
      else if (modal) await api.patch(`/v1/catalog/products/${modal.id}`, payload);
      setModal(null);
      await reload();
    }, modal === "new" ? "Producto creado" : "Producto actualizado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Productos"
          desc="Catálogo completo: precio, impuesto, barcode, curso KDS y categoría."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} onClick={() => { setForm(emptyForm()); setModal("new"); }}>
                + Nuevo producto
              </button>
            </>
          }
        />

        <AdminSection title="Buscar y filtrar">
          <div style={adminStyles.grid2}>
            <Field label="Texto">
              <input style={adminStyles.input} placeholder="Nombre, SKU o código de barras…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </Field>
            <Field label="Categoría">
              <select style={adminStyles.select} value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option value="">Todas</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
        </AdminSection>

        <AdminSection title={`${filtered.length} productos`}>
          {filtered.length === 0 ? (
            <EmptyState text="No hay productos que coincidan." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Producto</th>
                  <th style={adminStyles.th}>Categoría</th>
                  <th style={adminStyles.th}>Precio</th>
                  <th style={adminStyles.th}>IVA</th>
                  <th style={adminStyles.th}>Curso</th>
                  <th style={adminStyles.th}>Barcode</th>
                  <th style={adminStyles.th}>Unidad</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td style={adminStyles.td}>
                      <strong>{p.name}</strong>
                      <div><IdChip id={p.id} /></div>
                    </td>
                    <td style={adminStyles.td}>{p.category?.name ?? "—"}</td>
                    <td style={adminStyles.td}>{formatCOP(Number(p.variants[0]?.price ?? 0))}</td>
                    <td style={adminStyles.td}>{taxLabel(p.taxType)}</td>
                    <td style={adminStyles.td}>{courseLabel(p.course)}</td>
                    <td style={adminStyles.td}>{p.variants[0]?.barcode ?? "—"}</td>
                    <td style={adminStyles.td}>{p.variants[0]?.sellByWeight ? p.variants[0]?.unit ?? "kg" : "und"}</td>
                    <td style={adminStyles.td}><Badge ok={p.isActive} label={p.isActive ? "Activo" : "Inactivo"} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(p)}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnDanger} onClick={async () => {
                        await runAction(async () => {
                          await api.patch(`/v1/catalog/products/${p.id}`, { isActive: !p.isActive });
                          await reload();
                        }, p.isActive ? "Producto desactivado" : "Producto activado");
                      }}>{p.isActive ? "Off" : "On"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {modal && (
          <AdminModal
            title={modal === "new" ? "Nuevo producto" : `Editar: ${(modal as Product).name}`}
            onClose={() => setModal(null)}
            footer={<ModalFooter onCancel={() => setModal(null)} onSave={save} saving={saving} disabled={!form.name.trim() || !form.price} />}
          >
            <Field label="Nombre">
              <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Descripción">
              <textarea style={{ ...adminStyles.input, minHeight: 60 }} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </Field>
            <div style={adminStyles.grid2}>
              <Field label="Categoría">
                <select style={adminStyles.select} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
                  <option value="">Sin categoría</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>
              <Field label="Curso KDS">
                <select style={adminStyles.select} value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })}>
                  {COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Tipo">
                <select style={adminStyles.select} value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {PRODUCT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Impuesto">
                <select style={adminStyles.select} value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })}>
                  {TAX_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </Field>
              <Field label="Precio venta">
                <input type="number" style={adminStyles.input} value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </Field>
              <Field label="Costo">
                <input type="number" style={adminStyles.input} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </Field>
              <Field label="SKU">
                <input style={adminStyles.input} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
              </Field>
              <Field label="Código barras">
                <input style={adminStyles.input} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
              </Field>
            </div>
            <CheckboxField
              label="Venta por peso"
              hint="Para carnes, frutas u otros productos que se pesan en báscula"
              checked={form.sellByWeight}
              onChange={(v) => setForm({ ...form, sellByWeight: v, unit: v ? "kg" : "und" })}
            />
            {form.sellByWeight && (
              <Field label="Unidad de medida">
                <select style={adminStyles.select} value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })}>
                  {PRODUCT_UNITS.filter((u) => u.value !== "und").map((u) => (
                    <option key={u.value} value={u.value}>{u.label}</option>
                  ))}
                </select>
              </Field>
            )}
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
