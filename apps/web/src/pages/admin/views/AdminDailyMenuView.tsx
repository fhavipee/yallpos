import { useMemo, useState } from "react";
import { api, formatCOP } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  EmptyState,
  Field,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type Product = { id: string; name: string; isActive: boolean; category?: { name: string }; variants: { price: string }[] };

export default function AdminDailyMenuView() {
  const runAction = useAdminAction();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: products, loading, error, reload } = useAdminResource(async () => {
    const [productsRes, dailyRes] = await Promise.all([
      api.get("/v1/catalog/products", { params: { all: "0" } }),
      api.get("/v1/restaurant/daily-menu"),
    ]);
    setSelected(new Set(dailyRes.data.items.map((i: { productId: string }) => i.productId)));
    setNote(dailyRes.data.note ?? "");
    return productsRes.data as Product[];
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (products ?? []).filter((p) => p.isActive && (!q || p.name.toLowerCase().includes(q)));
  }, [products, search]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function publish() {
    setSaving(true);
    await runAction(async () => {
      await api.put("/v1/restaurant/daily-menu", {
        note,
        items: [...selected].map((productId) => ({ productId })),
      });
      await reload();
    }, "Menú del día publicado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Menú del día"
          desc="Selecciona platos destacados para hoy. Se muestran en POS con precio normal."
          actions={
            <>
              <ReloadButton onClick={reload} />
              <button type="button" style={{ ...adminStyles.btnPrimary, marginLeft: 8 }} disabled={saving} onClick={publish}>
                {saving ? "Publicando…" : "Publicar menú del día"}
              </button>
            </>
          }
        />

        <AdminSection title="Nota del día" desc="Aparece en pantalla de meseros y mostrador.">
          <Field label="Mensaje">
            <input style={adminStyles.input} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sugerencia del chef — …" />
          </Field>
        </AdminSection>

        <AdminSection title={`Platos seleccionados (${selected.size})`}>
          <input style={{ ...adminStyles.input, marginBottom: 12 }} placeholder="Buscar producto…" value={search} onChange={(e) => setSearch(e.target.value)} />
          {filtered.length === 0 ? (
            <EmptyState text="No hay productos activos para el menú del día." />
          ) : (
            <div style={{ display: "grid", gap: 8 }}>
              {filtered.map((p) => (
                <label
                  key={p.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: 12,
                    border: "1px solid var(--t-border)",
                    borderRadius: 10,
                    background: selected.has(p.id) ? "var(--t-accent-soft)" : "var(--t-card)",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{p.category?.name ?? "Sin categoría"}</div>
                  </div>
                  <div style={{ fontWeight: 600 }}>{formatCOP(Number(p.variants[0]?.price ?? 0))}</div>
                </label>
              ))}
            </div>
          )}
        </AdminSection>
      </>
    </AdminViewGate>
  );
}
