import { useEffect, useMemo, useState } from "react";
import { api, setBranchId, formatCOP } from "../lib/api";
type TaxDef = { kind: string; code: string; name: string };

type Product = {
  id: string;
  name: string;
  isActive: boolean;
  course?: string;
  ivaTaxCode?: string;
  consumptionTaxCode?: string;
  taxType?: string;
  consumptionTaxType?: string;
  category?: { id: string; name: string; color?: string };
  variants: { id: string; price: string; cost: string; barcode?: string }[];
};

type Category = { id: string; name: string; color?: string };

const COURSES = [
  { value: "appetizer", label: "Entrada" },
  { value: "main", label: "Plato fuerte" },
  { value: "drink", label: "Bebida" },
  { value: "dessert", label: "Postre" },
];

export default function MenuPage({ branchId }: { branchId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taxes, setTaxes] = useState<TaxDef[]>([]);
  const [filter, setFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editTaxType, setEditTaxType] = useState("iva_19");
  const [editConsumptionTaxType, setEditConsumptionTaxType] = useState("none");
  const [showNew, setShowNew] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [menuMeta, setMenuMeta] = useState<{ categories: number; items: number } | null>(null);
  const [newItem, setNewItem] = useState({
    name: "", price: "", categoryId: "", course: "main", taxType: "iva_19", consumptionTaxType: "none",
  });
  const [dailyIds, setDailyIds] = useState<Set<string>>(new Set());
  const [dailyNote, setDailyNote] = useState("");
  const [savingDaily, setSavingDaily] = useState(false);
  const [dailyMenuOpen, setDailyMenuOpen] = useState(() => localStorage.getItem("menuDailyOpen") !== "0");

  async function load() {
    const [p, c, t, m, daily] = await Promise.all([
      api.get("/v1/catalog/products", { params: { all: "1" } }),
      api.get("/v1/catalog/categories"),
      api.get("/v1/catalog/taxes"),
      api.get("/v1/pilot/menu").catch(() => null),
      api.get("/v1/restaurant/daily-menu").catch(() => null),
    ]);
    setProducts(p.data);
    setCategories(c.data);
    setTaxes(t.data);
    if (m?.data) setMenuMeta({ categories: m.data.categories, items: m.data.items });
    if (daily?.data) {
      setDailyIds(new Set(daily.data.items.map((i: { productId: string }) => i.productId)));
      setDailyNote(daily.data.note ?? "");
    }
  }

  useEffect(() => { setBranchId(branchId); }, [branchId]);
  useEffect(() => { load(); }, [branchId]);

  const filtered = useMemo(() => {
    let list = products;
    if (catFilter) list = list.filter((p) => p.category?.id === catFilter);
    if (filter) list = list.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));
    return list;
  }, [products, catFilter, filter]);

  const grouped = useMemo(() => {
    const map: Record<string, Product[]> = {};
    for (const p of filtered) {
      const key = p.category?.name ?? "Sin categoría";
      (map[key] ??= []).push(p);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => ({
    active: products.filter((p) => p.isActive).length,
    total: products.length,
  }), [products]);

  async function saveProduct(product: Product) {
    await api.patch(`/v1/catalog/products/${product.id}`, {
      name: editName.trim() || product.name,
      price: Number(editPrice),
      taxType: editTaxType,
      consumptionTaxType: editConsumptionTaxType,
    });
    setEditing(null);
    load();
  }

  const ivaOptions = useMemo(() => taxes.filter((t) => t.kind === "iva"), [taxes]);
  const consumptionOptions = useMemo(() => taxes.filter((t) => t.kind === "consumption"), [taxes]);

  const productIva = (p: Product) => p.ivaTaxCode ?? p.taxType ?? "iva_19";
  const productInc = (p: Product) => p.consumptionTaxCode ?? p.consumptionTaxType ?? "none";

  const taxLabel = (p: Product) => {
    const iva = ivaOptions.find((t) => t.code === productIva(p))?.name ?? "IVA 19%";
    const inc = consumptionOptions.find((t) => t.code === productInc(p))?.name;
    return inc && productInc(p) !== "none" ? `${iva} · ${inc}` : iva;
  };

  async function toggleActive(product: Product) {
    await api.patch(`/v1/catalog/products/${product.id}`, { isActive: !product.isActive });
    load();
  }

  async function syncOfficialMenu() {
    if (!confirm("¿Sincronizar menú oficial? Actualiza precios y desactiva platos que ya no están en el catálogo piloto.")) return;
    setSyncing(true);
    try {
      const res = await api.post("/v1/pilot/sync-menu");
      alert(
        `Menú sincronizado\n` +
        `Nuevos: ${res.data.created}\n` +
        `Actualizados: ${res.data.updated}\n` +
        `Desactivados: ${res.data.deactivated ?? 0}\n` +
        `Activos: ${res.data.activeProducts}`
      );
      load();
    } catch (e: any) {
      alert(e.response?.data?.message ?? "No se pudo sincronizar");
    } finally {
      setSyncing(false);
    }
  }

  async function createProduct() {
    if (!newItem.name || !newItem.price) return;
    await api.post("/v1/catalog/products", {
      name: newItem.name,
      price: Number(newItem.price),
      categoryId: newItem.categoryId || undefined,
      course: newItem.course,
      taxType: newItem.taxType,
      consumptionTaxType: newItem.consumptionTaxType,
    });
    setShowNew(false);
    setNewItem({ name: "", price: "", categoryId: "", course: "main", taxType: "iva_19", consumptionTaxType: "none" });
    load();
  }

  function toggleDaily(productId: string) {
    setDailyIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function suggestDailyMenu() {
    const keywords = ["sopa del día", "bandeja paisa", "cóctel de la casa", "tres leches"];
    const picks = products.filter((p) =>
      p.isActive && keywords.some((k) => p.name.toLowerCase().includes(k)),
    );
    setDailyIds(new Set(picks.map((p) => p.id)));
    setDailyNote("Sugerencia del chef — " + new Date().toLocaleDateString("es-CO"));
  }

  async function saveDailyMenu() {
    setSavingDaily(true);
    try {
      await api.put("/v1/restaurant/daily-menu", {
        note: dailyNote,
        items: [...dailyIds].map((productId) => ({ productId })),
      });
      alert("Menú del día publicado");
    } catch (e: any) {
      alert(e.response?.data?.message ?? "No se pudo guardar");
    } finally {
      setSavingDaily(false);
    }
  }

  function toggleDailyMenuOpen() {
    setDailyMenuOpen((open) => {
      const next = !open;
      localStorage.setItem("menuDailyOpen", next ? "1" : "0");
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20, gap: 16, flexWrap: "wrap" }}>
        <div>
      <h2 style={{ margin: 0, color: "var(--t-fg)" }}>Menú — Restaurante de Yall</h2>
          <p style={{ margin: "4px 0 0", color: "var(--t-muted)", fontSize: 14 }}>
            {stats.active} activos · {stats.total} total
            {menuMeta ? ` · Catálogo oficial: ${menuMeta.items} platos en ${menuMeta.categories} categorías` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={syncOfficialMenu} disabled={syncing} style={btnSecondary}>
            {syncing ? "Sincronizando…" : "↻ Sincronizar menú oficial"}
          </button>
          <button onClick={() => setShowNew(true)} style={btnPrimary}>+ Nuevo producto</button>
        </div>
      </div>

      <div style={{
        background: "var(--t-warn-soft)", border: "1px solid var(--t-warn-border)", borderRadius: 12,
        padding: dailyMenuOpen ? 16 : "12px 16px", marginBottom: 20,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={toggleDailyMenuOpen}
            aria-expanded={dailyMenuOpen}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10, flex: 1, minWidth: 220,
              padding: 0, border: "none", background: "transparent", cursor: "pointer", textAlign: "left",
            }}
          >
            <span style={{
              marginTop: 2, fontSize: 12, color: "#92400e", transition: "transform 0.15s ease",
              transform: dailyMenuOpen ? "rotate(90deg)" : "rotate(0deg)",
            }}>
              ▶
            </span>
            <div>
              <h3 style={{ margin: "0 0 4px", color: "var(--t-fg)" }}>⭐ Menú del día</h3>
              <p style={{ margin: 0, fontSize: 13, color: "var(--t-muted)" }}>
                {dailyIds.size} platos destacados hoy — visibles primero en comanda
                {!dailyMenuOpen && dailyNote ? ` · ${dailyNote}` : ""}
              </p>
            </div>
          </button>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {dailyMenuOpen && (
              <button onClick={suggestDailyMenu} style={btnSecondary}>Sugerencia chef</button>
            )}
            <button onClick={saveDailyMenu} disabled={savingDaily} style={btnPrimary}>
              {savingDaily ? "Guardando…" : "Publicar hoy"}
            </button>
            <button
              type="button"
              onClick={toggleDailyMenuOpen}
              style={btnSecondary}
              title={dailyMenuOpen ? "Ocultar selección" : "Mostrar selección"}
            >
              {dailyMenuOpen ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>
        {dailyMenuOpen && (
          <>
            <input
              placeholder="Nota del día (ej. Promoción almuerzo ejecutivo)"
              value={dailyNote}
              onChange={(e) => setDailyNote(e.target.value)}
              style={{ width: "100%", marginTop: 12, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-warn-border)" }}
            />
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
              {products.filter((p) => p.isActive).map((p) => (
                <label key={p.id} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
                  borderRadius: 8, border: "1px solid", cursor: "pointer", fontSize: 13,
                  borderColor: dailyIds.has(p.id) ? "#f59e0b" : "var(--t-border)",
                  background: dailyIds.has(p.id) ? "var(--t-warn-soft)" : "var(--t-card)",
                }}>
                  <input type="checkbox" checked={dailyIds.has(p.id)} onChange={() => toggleDaily(p.id)} />
                  {p.name}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
        <CatChip active={!catFilter} onClick={() => setCatFilter("")} color="#2563eb">Todos</CatChip>
        {categories.map((c) => (
          <CatChip key={c.id} active={catFilter === c.id} onClick={() => setCatFilter(c.id)} color={c.color ?? "#64748b"}>
            {c.name}
          </CatChip>
        ))}
      </div>

      <input
        placeholder="Buscar producto..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        style={{ width: "100%", maxWidth: 320, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", marginBottom: 16 }}
      />

      {Object.entries(grouped).map(([catName, list]) => (
        <div key={catName} style={{ marginBottom: 24 }}>
          <h4 style={{ margin: "0 0 10px", color: "var(--t-muted)" }}>{catName} ({list.length})</h4>
          <div style={{ display: "grid", gap: 8 }}>
            {list.map((p) => {
              const price = Number(p.variants[0]?.price ?? 0);
              const barcode = p.variants[0]?.barcode;
              const isEditing = editing === p.id;
              return (
                <div key={p.id} style={{
                  display: "grid", gridTemplateColumns: isEditing ? "1fr auto auto auto auto auto" : "1fr auto auto auto auto", gap: 12, alignItems: "center",
                  padding: "12px 16px", background: p.isActive ? "var(--t-card)" : "var(--t-card-alt)",
                  border: "1px solid var(--t-border)", borderRadius: 10, opacity: p.isActive ? 1 : 0.6,
                  borderLeft: p.category?.color ? `4px solid ${p.category.color}` : undefined,
                }}>
                  <div>
                    {isEditing ? (
                      <input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        style={{ width: "100%", padding: 6, borderRadius: 6, border: "1px solid var(--t-border-strong)", marginBottom: 4 }}
                      />
                    ) : (
                      <div style={{ fontWeight: 600 }}>{p.name}</div>
                    )}
                    <div style={{ fontSize: 12, color: "var(--t-muted)" }}>
                      {COURSES.find((c) => c.value === p.course)?.label ?? p.course}
                      {barcode ? ` · ${barcode}` : ""}
                      {!isEditing ? ` · ${taxLabel(p)}` : ""}
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <select
                        value={editTaxType}
                        onChange={(e) => setEditTaxType(e.target.value)}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--t-border-strong)", fontSize: 12 }}
                      >
                        {ivaOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                      </select>
                      <select
                        value={editConsumptionTaxType}
                        onChange={(e) => setEditConsumptionTaxType(e.target.value)}
                        style={{ padding: 6, borderRadius: 6, border: "1px solid var(--t-border-strong)", fontSize: 12 }}
                      >
                        {consumptionOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
                      </select>
                    </>
                  ) : null}

                  {isEditing ? (
                    <input
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                      style={{ width: 100, padding: 6, borderRadius: 6, border: "1px solid var(--t-border-strong)" }}
                    />
                  ) : (
                    <span style={{ fontWeight: 700, minWidth: 90, textAlign: "right" }}>{formatCOP(price)}</span>
                  )}

                  {isEditing ? (
                    <button onClick={() => saveProduct(p)} style={btnSmall}>Guardar</button>
                  ) : (
                    <button
                      onClick={() => {
                        setEditing(p.id);
                        setEditName(p.name);
                        setEditPrice(String(price));
                        setEditTaxType(productIva(p));
                        setEditConsumptionTaxType(productInc(p));
                      }}
                      style={btnSmall}
                    >
                      Editar
                    </button>
                  )}

                  <button onClick={() => toggleActive(p)} style={{ ...btnSmall, color: p.isActive ? "#dc2626" : "#16a34a" }}>
                    {p.isActive ? "Ocultar" : "Activar"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
          <div style={{ background: "var(--t-card)", borderRadius: 16, padding: 24, width: 360 }}>
            <h3 style={{ margin: "0 0 16px" }}>Nuevo producto</h3>
            <Field label="Nombre" value={newItem.name} onChange={(v) => setNewItem({ ...newItem, name: v })} />
            <Field label="Precio" value={newItem.price} onChange={(v) => setNewItem({ ...newItem, price: v })} type="number" />
            <label style={labelStyle}>
              Categoría
              <select value={newItem.categoryId} onChange={(e) => setNewItem({ ...newItem, categoryId: e.target.value })} style={inputStyle}>
                <option value="">Sin categoría</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Tipo (KDS)
              <select value={newItem.course} onChange={(e) => setNewItem({ ...newItem, course: e.target.value })} style={inputStyle}>
                {COURSES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              IVA
              <select value={newItem.taxType} onChange={(e) => setNewItem({ ...newItem, taxType: e.target.value })} style={inputStyle}>
                {ivaOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
            <label style={labelStyle}>
              Impoconsumo
              <select value={newItem.consumptionTaxType} onChange={(e) => setNewItem({ ...newItem, consumptionTaxType: e.target.value })} style={inputStyle}>
                {consumptionOptions.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
              </select>
            </label>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button onClick={() => setShowNew(false)} style={{ flex: 1, padding: 10, borderRadius: 8, border: "1px solid var(--t-border-strong)", cursor: "pointer" }}>Cancelar</button>
              <button onClick={createProduct} style={{ ...btnPrimary, flex: 1 }}>Crear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CatChip({ active, onClick, color, children }: { active: boolean; onClick: () => void; color: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "6px 14px", borderRadius: 20, border: "none", cursor: "pointer", fontSize: 13,
        background: active ? color : "var(--t-chip-bg)", color: active ? "#fff" : "var(--t-chip-fg)",
      }}
    >
      {children}
    </button>
  );
}

function Field({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label style={labelStyle}>
      {label}
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </label>
  );
}

const labelStyle: React.CSSProperties = { display: "grid", gap: 4, fontSize: 14, marginBottom: 10, color: "var(--t-fg)" };
const inputStyle: React.CSSProperties = {
  padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)",
  background: "var(--t-input-bg)", color: "var(--t-input-fg)",
};
const btnPrimary: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: "#2563eb", color: "#fff", fontWeight: 600, cursor: "pointer" };
const btnSecondary: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)", cursor: "pointer" };
const btnSmall: React.CSSProperties = { padding: "6px 12px", borderRadius: 6, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)", cursor: "pointer", fontSize: 13 };
