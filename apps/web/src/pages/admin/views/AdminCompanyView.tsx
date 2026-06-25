import { useState } from "react";
import { api } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  Field,
  IdChip,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

const VERTICALS = [
  { value: "restaurant", label: "Restaurante" },
  { value: "bakery", label: "Panadería" },
  { value: "cafe", label: "Café" },
  { value: "minimarket", label: "Minimercado" },
  { value: "retail", label: "Retail" },
];

type Company = {
  id: string;
  name?: string;
  razonSocial?: string;
  nit?: string;
  dv?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  department?: string;
  vertical?: string;
  country?: string;
  regimen?: string;
};

export default function AdminCompanyView() {
  const runAction = useAdminAction();
  const [saving, setSaving] = useState(false);

  const { data: company, loading, error, reload, setData } = useAdminResource(async () => {
    const r = await api.get("/v1/settings/company");
    return r.data as Company;
  }, []);

  function setField(key: keyof Company, value: string) {
    setData((c) => (c ? { ...c, [key]: value } : c));
  }

  async function save() {
    if (!company) return;
    setSaving(true);
    await runAction(async () => {
      await api.patch("/v1/admin/company", {
        name: company.name,
        razonSocial: company.razonSocial,
        nit: company.nit,
        dv: company.dv,
        email: company.email,
        phone: company.phone,
        address: company.address,
        city: company.city,
        department: company.department,
        vertical: company.vertical,
      });
    }, "Empresa actualizada");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload} loadingText="Cargando empresa…">
      {company && (
        <>
          <AdminPageHeader
            title="Empresa"
            desc="Datos legales y fiscales. Aparecen en factura POS y documentos DIAN."
            actions={<ReloadButton onClick={reload} />}
          />

          <AdminSection title="Datos legales">
            <p style={{ fontSize: 13, color: "var(--t-muted)" }}>
              ID empresa: <IdChip id={company.id} /> · Régimen: {company.regimen ?? "—"}
            </p>
            <div className={adminStyles.grid2}>
              <Field label="Nombre comercial">
                <input style={adminStyles.input} value={company.name ?? ""} onChange={(e) => setField("name", e.target.value)} />
              </Field>
              <Field label="Razón social">
                <input style={adminStyles.input} value={company.razonSocial ?? ""} onChange={(e) => setField("razonSocial", e.target.value)} />
              </Field>
              <Field label="NIT">
                <input style={adminStyles.input} value={company.nit ?? ""} onChange={(e) => setField("nit", e.target.value)} />
              </Field>
              <Field label="DV">
                <input style={adminStyles.input} value={company.dv ?? ""} onChange={(e) => setField("dv", e.target.value)} />
              </Field>
              <Field label="Vertical">
                <select style={adminStyles.select} value={company.vertical ?? "restaurant"} onChange={(e) => setField("vertical", e.target.value)}>
                  {VERTICALS.map((v) => (
                    <option key={v.value} value={v.value}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="País">
                <input style={adminStyles.input} value={company.country ?? "CO"} readOnly />
              </Field>
            </div>
          </AdminSection>

          <AdminSection title="Contacto y ubicación">
            <div className={adminStyles.grid2}>
              <Field label="Email facturación">
                <input style={adminStyles.input} type="email" value={company.email ?? ""} onChange={(e) => setField("email", e.target.value)} />
              </Field>
              <Field label="Teléfono">
                <input style={adminStyles.input} value={company.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
              </Field>
              <Field label="Dirección">
                <input style={adminStyles.input} value={company.address ?? ""} onChange={(e) => setField("address", e.target.value)} />
              </Field>
              <Field label="Ciudad">
                <input style={adminStyles.input} value={company.city ?? ""} onChange={(e) => setField("city", e.target.value)} />
              </Field>
              <Field label="Departamento">
                <input style={adminStyles.input} value={company.department ?? ""} onChange={(e) => setField("department", e.target.value)} />
              </Field>
            </div>
            <button type="button" style={{ ...adminStyles.btnPrimary, marginTop: 8 }} disabled={saving} onClick={save}>
              {saving ? "Guardando…" : "Guardar empresa"}
            </button>
          </AdminSection>
        </>
      )}
    </AdminViewGate>
  );
}
