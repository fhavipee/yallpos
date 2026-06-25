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
import { COURSES, PRODUCT_TYPES, PRODUCT_UNITS } from "../types";

type TaxDef = { kind: string; code: string; name: string; rate: string };

type Product = {
  id: string;
  name: string;
  description?: string;
  type: string;
  isIngredient?: boolean;
  ivaTaxCode?: string;
  consumptionTaxCode?: string;
  taxType?: string;
  consumptionTaxType?: string;
  course?: string;
  isActive: boolean;
  category?: { id: string; name: string };
  variants: { id: string; price: string; cost: string; barcode?: string; sku?: string; name: string; sellByWeight?: boolean; unit?: string }[];
  recipeLines?: {
    id: string;
    quantity: string;
    unit: string;
    ingredientVariant: { id: string; name: string; cost: string; unit: string; product: { name: string } };
  }[];
};

type IngredientProduct = {
  id: string;
  name: string;
  variants: { id: string; name: string; unit: string; cost: string }[];
};

type RecipeLineForm = { ingredientVariantId: string; quantity: string; unit: string; label: string };

type Category = { id: string; name: string };

const emptyForm = () => ({
  name: "",
  description: "",
  categoryId: "",
  type: "standard",
  taxType: "iva_19",
  consumptionTaxType: "none",
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
  const [recipeModal, setRecipeModal] = useState<Product | null>(null);
  const [recipeLines, setRecipeLines] = useState<RecipeLineForm[]>([]);
  const [ingredientSearch, setIngredientSearch] = useState("");
  const [recipeSaving, setRecipeSaving] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [p, c, t, ing] = await Promise.all([
      api.get("/v1/catalog/products", { params: { all: "1" } }),
      api.get("/v1/catalog/categories"),
      api.get("/v1/catalog/taxes"),
      api.get("/v1/catalog/products", { params: { ingredients: "1", all: "1" } }),
    ]);
    return {
      products: p.data as Product[],
      categories: c.data as Category[],
      taxes: t.data as TaxDef[],
      ingredients: ing.data as IngredientProduct[],
    };
  }, []);

  const products = data?.products ?? [];
  const categories = data?.categories ?? [];
  const taxes = data?.taxes ?? [];
  const ingredients = data?.ingredients ?? [];
  const ivaOptions = taxes.filter((t) => t.kind === "iva");
  const consumptionOptions = taxes.filter((t) => t.kind === "consumption");

  const productIva = (p: Product) => p.ivaTaxCode ?? p.taxType ?? "iva_19";
  const productInc = (p: Product) => p.consumptionTaxCode ?? p.consumptionTaxType ?? "none";

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return products.filter((p) => {
      if (p.isIngredient) return false;
      if (categoryFilter && p.category?.id !== categoryFilter) return false;
      return !q || p.name.toLowerCase().includes(q) || p.variants[0]?.barcode?.includes(q) || p.variants[0]?.sku?.toLowerCase().includes(q);
    });
  }, [products, search, categoryFilter]);

  const ingredientOptions = useMemo(() => {
    const q = ingredientSearch.toLowerCase();
    return ingredients.flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        label: `${p.name}${v.name !== p.name ? ` · ${v.name}` : ""}`,
        unit: v.unit,
      })),
    ).filter((o) => !q || o.label.toLowerCase().includes(q));
  }, [ingredients, ingredientSearch]);

  function openRecipeModal(product: Product) {
    setRecipeModal(product);
    setIngredientSearch("");
    setRecipeLines(
      (product.recipeLines ?? []).map((line) => ({
        ingredientVariantId: line.ingredientVariant.id,
        quantity: String(line.quantity),
        unit: line.unit || line.ingredientVariant.unit || "und",
        label: line.ingredientVariant.product?.name ?? line.ingredientVariant.name,
      })),
    );
  }

  function addRecipeLine(variantId: string, label: string, unit: string) {
    if (recipeLines.some((l) => l.ingredientVariantId === variantId)) return;
    setRecipeLines([...recipeLines, { ingredientVariantId: variantId, quantity: "1", unit, label }]);
    setIngredientSearch("");
  }

  async function saveRecipe() {
    if (!recipeModal) return;
    setRecipeSaving(true);
    await runAction(async () => {
      await api.put(`/v1/catalog/products/${recipeModal.id}/recipe`, {
        lines: recipeLines.map((l) => ({
          ingredientVariantId: l.ingredientVariantId,
          quantity: Number(l.quantity),
          unit: l.unit,
        })),
      });
      setRecipeModal(null);
      await reload();
    }, "Receta guardada");
    setRecipeSaving(false);
  }

  const recipeCostPreview = useMemo(() => {
    return recipeLines.reduce((sum, line) => {
      const ing = ingredients.flatMap((p) => p.variants).find((v) => v.id === line.ingredientVariantId);
      return sum + Number(line.quantity || 0) * Number(ing?.cost ?? 0);
    }, 0);
  }, [recipeLines, ingredients]);

  const taxLabel = (p: Product) => {
    const iva = ivaOptions.find((t) => t.code === productIva(p))?.name ?? productIva(p);
    const inc = consumptionOptions.find((t) => t.code === productInc(p))?.name;
    return inc && productInc(p) !== "none" ? `${iva} · ${inc}` : iva;
  };
  const courseLabel = (v?: string) => COURSES.find((c) => c.value === v)?.label ?? v ?? "—";

  function openEdit(p: Product) {
    const v = p.variants[0];
    setForm({
      name: p.name,
      description: p.description ?? "",
      categoryId: p.category?.id ?? "",
      type: p.type,
      taxType: productIva(p),
      consumptionTaxType: productInc(p),
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
      consumptionTaxType: form.consumptionTaxType,
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
                  <th style={adminStyles.th}>Ingredientes</th>
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
                    <td style={adminStyles.td}>{taxLabel(p)}</td>
                    <td style={adminStyles.td}>
                      {(p.recipeLines?.length ?? 0) > 0 ? `${p.recipeLines!.length} ítems` : "—"}
                    </td>
                    <td style={adminStyles.td}>{courseLabel(p.course)}</td>
                    <td style={adminStyles.td}>{p.variants[0]?.barcode ?? "—"}</td>
                    <td style={adminStyles.td}>{p.variants[0]?.sellByWeight ? p.variants[0]?.unit ?? "kg" : "und"}</td>
                    <td style={adminStyles.td}><Badge ok={p.isActive} label={p.isActive ? "Activo" : "Inactivo"} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(p)}>Editar</button>{" "}
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openRecipeModal(p)}>Ingredientes</button>{" "}
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
              <Field label="IVA">
                <select style={adminStyles.select} value={form.taxType} onChange={(e) => setForm({ ...form, taxType: e.target.value })}>
                  {ivaOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Impoconsumo">
                <select style={adminStyles.select} value={form.consumptionTaxType} onChange={(e) => setForm({ ...form, consumptionTaxType: e.target.value })}>
                  {consumptionOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
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

        {recipeModal && (
          <AdminModal
            title={`Ingredientes: ${recipeModal.name}`}
            onClose={() => setRecipeModal(null)}
            footer={
              <ModalFooter
                onCancel={() => setRecipeModal(null)}
                onSave={saveRecipe}
                saving={recipeSaving}
                saveLabel="Guardar receta"
                disabled={recipeLines.length === 0}
              />
            }
          >
            <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
              Al cobrar, el inventario descuenta estos insumos (no el plato terminado). Costo estimado: <strong>{formatCOP(recipeCostPreview)}</strong>
            </p>

            {recipeLines.length > 0 && (
              <table style={{ ...adminStyles.table, marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th style={adminStyles.th}>Insumo</th>
                    <th style={adminStyles.th}>Cantidad</th>
                    <th style={adminStyles.th}>Unidad</th>
                    <th style={adminStyles.th}></th>
                  </tr>
                </thead>
                <tbody>
                  {recipeLines.map((line) => (
                    <tr key={line.ingredientVariantId}>
                      <td style={adminStyles.td}>{line.label}</td>
                      <td style={adminStyles.td}>
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          style={{ ...adminStyles.input, width: 90 }}
                          value={line.quantity}
                          onChange={(e) => setRecipeLines(recipeLines.map((l) =>
                            l.ingredientVariantId === line.ingredientVariantId ? { ...l, quantity: e.target.value } : l,
                          ))}
                        />
                      </td>
                      <td style={adminStyles.td}>{line.unit}</td>
                      <td style={adminStyles.td}>
                        <button
                          type="button"
                          style={adminStyles.btnDanger}
                          onClick={() => setRecipeLines(recipeLines.filter((l) => l.ingredientVariantId !== line.ingredientVariantId))}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <Field label="Agregar insumo">
              <input
                style={adminStyles.input}
                placeholder="Buscar insumo…"
                value={ingredientSearch}
                onChange={(e) => setIngredientSearch(e.target.value)}
              />
            </Field>
            {ingredientSearch && (
              <div style={{ maxHeight: 160, overflow: "auto", border: "1px solid var(--t-border)", borderRadius: 8 }}>
                {ingredientOptions.slice(0, 12).map((opt) => (
                  <button
                    key={opt.variantId}
                    type="button"
                    onClick={() => addRecipeLine(opt.variantId, opt.label, opt.unit)}
                    style={{
                      display: "block", width: "100%", textAlign: "left", padding: "8px 12px",
                      border: "none", background: "transparent", cursor: "pointer",
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
                {ingredientOptions.length === 0 && (
                  <p style={{ padding: 12, margin: 0, fontSize: 13, color: "var(--t-muted)" }}>Sin coincidencias</p>
                )}
              </div>
            )}
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
