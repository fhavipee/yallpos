import { useMemo, useState } from "react";
import { api } from "../../../lib/api";
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

const DOC_TYPES = [
  { value: "CC", label: "Cédula" },
  { value: "NIT", label: "NIT" },
  { value: "CE", label: "Cédula extranjería" },
  { value: "PA", label: "Pasaporte" },
  { value: "TI", label: "TI" },
  { value: "RC", label: "Registro civil" },
  { value: "DIE", label: "Doc. extranjero" },
];

type Customer = {
  id: string;
  docType: string;
  docNumber?: string | null;
  dv?: string | null;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  department?: string | null;
  loyaltyEnabled: boolean;
  loyaltyPoints: number;
  loyaltyTier?: string | null;
  discountPercent: number | string;
  notes?: string | null;
  isActive: boolean;
  isGeneric?: boolean;
};

const emptyForm = () => ({
  docType: "CC",
  docNumber: "",
  dv: "",
  name: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  department: "",
  loyaltyEnabled: false,
  loyaltyTier: "",
  discountPercent: "0",
  notes: "",
});

export default function AdminCustomersView() {
  const runAction = useAdminAction();
  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"new" | Customer | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [genericSaving, setGenericSaving] = useState(false);
  const [genericForm, setGenericForm] = useState({
    defaultBuyerDocType: "CC",
    defaultBuyerDocNumber: "222222222222",
    defaultBuyerName: "Consumidor final",
    defaultBuyerDv: "",
  });

  const { data: customers, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/customers", { params: { q: q.trim() || undefined, take: 100 } });
    return r.data as Customer[];
  }, [q]);

  const { data: generic, reload: reloadGeneric } = useAdminResource(async () => {
    const r = await api.get("/v1/customers/generic");
    const d = r.data as {
      companyDefaults: typeof genericForm;
    };
    setGenericForm({
      defaultBuyerDocType: d.companyDefaults.defaultBuyerDocType || "CC",
      defaultBuyerDocNumber: d.companyDefaults.defaultBuyerDocNumber || "222222222222",
      defaultBuyerName: d.companyDefaults.defaultBuyerName || "Consumidor final",
      defaultBuyerDv: d.companyDefaults.defaultBuyerDv || "",
    });
    return d;
  }, []);

  const list = useMemo(() => customers ?? [], [customers]);

  function openNew() {
    setForm(emptyForm());
    setModal("new");
  }

  function openEdit(c: Customer) {
    setForm({
      docType: c.docType,
      docNumber: c.docNumber ?? "",
      dv: c.dv ?? "",
      name: c.name,
      email: c.email ?? "",
      phone: c.phone ?? "",
      address: c.address ?? "",
      city: c.city ?? "",
      department: c.department ?? "",
      loyaltyEnabled: c.loyaltyEnabled,
      loyaltyTier: c.loyaltyTier ?? "",
      discountPercent: String(c.discountPercent ?? 0),
      notes: c.notes ?? "",
    });
    setModal(c);
  }

  async function saveCustomer() {
    setSaving(true);
    await runAction(async () => {
      const payload = {
        docType: form.docType,
        docNumber: form.docNumber,
        dv: form.dv || undefined,
        name: form.name,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        department: form.department || undefined,
        loyaltyEnabled: form.loyaltyEnabled,
        loyaltyTier: form.loyaltyTier || undefined,
        discountPercent: Number(form.discountPercent) || 0,
        notes: form.notes || undefined,
      };
      if (modal === "new") {
        await api.post("/v1/customers", payload);
      } else if (modal && typeof modal === "object") {
        await api.patch(`/v1/customers/${modal.id}`, payload);
      }
      setModal(null);
      await reload();
    }, "Cliente guardado");
    setSaving(false);
  }

  async function saveGeneric() {
    setGenericSaving(true);
    await runAction(async () => {
      await api.patch("/v1/customers/generic", {
        defaultBuyerDocType: genericForm.defaultBuyerDocType,
        defaultBuyerDocNumber: genericForm.defaultBuyerDocNumber,
        defaultBuyerName: genericForm.defaultBuyerName,
        defaultBuyerDv: genericForm.defaultBuyerDv || undefined,
      });
      await reloadGeneric();
    }, "Consumidor genérico actualizado");
    setGenericSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload} loadingText="Cargando clientes…">
      <AdminPageHeader
        title="Clientes"
        desc="Base de adquirientes para factura electrónica, consumidor genérico y fidelización."
        actions={<ReloadButton onClick={() => { reload(); reloadGeneric(); }} />}
      />

      <AdminSection title="Consumidor genérico (sin factura nominada)" desc="Usado cuando el cliente no pide factura con datos. Por defecto DIAN: 222222222222.">
        <div className={adminStyles.grid2}>
          <Field label="Tipo documento">
            <select
              style={adminStyles.select}
              value={genericForm.defaultBuyerDocType}
              onChange={(e) => setGenericForm({ ...genericForm, defaultBuyerDocType: e.target.value })}
            >
              {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
          <Field label="Número">
            <input
              style={adminStyles.input}
              value={genericForm.defaultBuyerDocNumber}
              onChange={(e) => setGenericForm({ ...genericForm, defaultBuyerDocNumber: e.target.value })}
            />
          </Field>
          <Field label="Nombre">
            <input
              style={adminStyles.input}
              value={genericForm.defaultBuyerName}
              onChange={(e) => setGenericForm({ ...genericForm, defaultBuyerName: e.target.value })}
            />
          </Field>
          <Field label="DV (opcional)">
            <input
              style={adminStyles.input}
              value={genericForm.defaultBuyerDv}
              onChange={(e) => setGenericForm({ ...genericForm, defaultBuyerDv: e.target.value })}
            />
          </Field>
        </div>
        <button type="button" style={{ ...adminStyles.btnPrimary, marginTop: 12 }} disabled={genericSaving} onClick={saveGeneric}>
          {genericSaving ? "Guardando…" : "Guardar consumidor genérico"}
        </button>
        {!generic && <p style={{ fontSize: 12, color: "var(--t-muted)" }}>Cargando defaults…</p>}
      </AdminSection>

      <AdminSection
        title={`Clientes (${list.length})`}
        actions={
          <>
            <input
              style={{ ...adminStyles.input, maxWidth: 220 }}
              placeholder="Buscar…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <button type="button" style={adminStyles.btnPrimary} onClick={openNew}>Nuevo cliente</button>
          </>
        }
      >
        {list.length === 0 ? (
          <EmptyState text="Sin clientes. Al cobrar con datos se crean automáticamente." />
        ) : (
          <table style={adminStyles.table}>
            <thead>
              <tr>
                <th style={adminStyles.th}>Cliente</th>
                <th style={adminStyles.th}>Documento</th>
                <th style={adminStyles.th}>Contacto</th>
                <th style={adminStyles.th}>Fidelización</th>
                <th style={adminStyles.th} />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id}>
                  <td style={adminStyles.td}>
                    <div style={{ fontWeight: 600 }}>{c.name}</div>
                    <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{c.city ?? "—"}</div>
                  </td>
                  <td style={adminStyles.td}>{c.docType} {c.docNumber}{c.dv ? `-${c.dv}` : ""}</td>
                  <td style={adminStyles.td}>
                    <div>{c.email ?? "—"}</div>
                    <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{c.phone ?? ""}</div>
                  </td>
                  <td style={adminStyles.td}>
                    {c.loyaltyEnabled ? (
                      <span>
                        {c.loyaltyPoints} pts
                        {Number(c.discountPercent) > 0 ? ` · ${c.discountPercent}%` : ""}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td style={adminStyles.td}>
                    <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(c)}>Editar</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </AdminSection>

      {modal && (
        <AdminModal
          title={modal === "new" ? "Nuevo cliente" : "Editar cliente"}
          onClose={() => setModal(null)}
          footer={
            <ModalFooter
              onCancel={() => setModal(null)}
              onSave={saveCustomer}
              saving={saving}
              disabled={!form.name.trim() || !form.docNumber.trim()}
            />
          }
        >
          <div className={adminStyles.grid2}>
            <Field label="Tipo documento">
              <select style={adminStyles.select} value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
                {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </Field>
            <Field label="Número">
              <input style={adminStyles.input} value={form.docNumber} onChange={(e) => setForm({ ...form, docNumber: e.target.value.replace(/\D/g, "") })} />
            </Field>
            {form.docType === "NIT" && (
              <Field label="DV">
                <input style={adminStyles.input} value={form.dv} onChange={(e) => setForm({ ...form, dv: e.target.value.replace(/\D/g, "").slice(0, 1) })} />
              </Field>
            )}
            <Field label="Nombre / razón social">
              <input style={adminStyles.input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <input style={adminStyles.input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Teléfono">
              <input style={adminStyles.input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <Field label="Dirección">
              <input style={adminStyles.input} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </Field>
            <Field label="Ciudad">
              <input style={adminStyles.input} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </Field>
            <Field label="Departamento">
              <input style={adminStyles.input} value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            </Field>
            <Field label="Descuento fidelización (%)">
              <input style={adminStyles.input} value={form.discountPercent} onChange={(e) => setForm({ ...form, discountPercent: e.target.value })} />
            </Field>
            <Field label="Nivel fidelización">
              <input style={adminStyles.input} value={form.loyaltyTier} onChange={(e) => setForm({ ...form, loyaltyTier: e.target.value })} placeholder="bronze / silver / gold" />
            </Field>
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, fontSize: 14 }}>
            <input type="checkbox" checked={form.loyaltyEnabled} onChange={(e) => setForm({ ...form, loyaltyEnabled: e.target.checked })} />
            Cliente en programa de fidelización (acumula puntos al pagar)
          </label>
          <Field label="Notas">
            <textarea style={{ ...adminStyles.input, minHeight: 64 }} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </AdminModal>
      )}
    </AdminViewGate>
  );
}
