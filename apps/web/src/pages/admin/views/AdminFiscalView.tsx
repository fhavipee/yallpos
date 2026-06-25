import { useState } from "react";
import { api } from "../../../lib/api";
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
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";
import { DOC_TYPES } from "../types";

type Resolution = {
  id: string;
  docType: string;
  prefix: string;
  fromNumber: number;
  toNumber: number;
  validFrom: string;
  validTo: string;
  currentNumber: number;
  technicalKey?: string;
  isActive: boolean;
};

type CertInfo = { loaded?: boolean; subject?: string; validTo?: string };

const emptyForm = () => ({
  docType: "pos_equivalent",
  prefix: "SETT",
  fromNumber: 1,
  toNumber: 5000,
  validFrom: "",
  validTo: "",
  technicalKey: "",
  isActive: true,
});

export default function AdminFiscalView() {
  const runAction = useAdminAction();
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState<Resolution | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const [r, c] = await Promise.all([
      api.get("/v1/admin/fiscal-resolutions"),
      api.get("/v1/fiscal/config").catch(() => ({ data: { loaded: false } })),
    ]);
    return { resolutions: r.data as Resolution[], cert: c.data as CertInfo };
  }, []);

  const resolutions = data?.resolutions ?? [];
  const cert = data?.cert;

  const docLabel = (v: string) => DOC_TYPES.find((d) => d.value === v)?.label ?? v;

  function openEdit(f: Resolution) {
    setForm({
      docType: f.docType,
      prefix: f.prefix,
      fromNumber: f.fromNumber,
      toNumber: f.toNumber,
      validFrom: f.validFrom ? f.validFrom.slice(0, 10) : "",
      validTo: f.validTo ? f.validTo.slice(0, 10) : "",
      technicalKey: f.technicalKey ?? "",
      isActive: f.isActive,
    });
    setEditModal(f);
  }

  async function uploadCert(file: File) {
    const password = window.prompt("Clave del certificado .p12") ?? "";
    if (!password) return;
    setUploading(true);
    await runAction(async () => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("password", password);
      await api.post("/v1/admin/fiscal/certificate", fd, { headers: { "Content-Type": "multipart/form-data" } });
      await reload();
    }, "Certificado cargado y validado");
    setUploading(false);
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="Fiscal / DIAN" desc="Resoluciones de numeración y certificado digital para facturación electrónica." actions={<ReloadButton onClick={reload} />} />

        <AdminSection title="Certificado digital (.p12)">
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <Badge ok={!!cert?.loaded} label={cert?.loaded ? "Cargado" : "No cargado"} />
            {cert?.subject && <span style={{ fontSize: 13 }}>{cert.subject}</span>}
          </div>
          {cert?.validTo && <p style={{ fontSize: 13, color: "var(--t-muted)" }}>Vence: {new Date(cert.validTo).toLocaleDateString("es-CO")}</p>}
          {!cert?.loaded && (
            <p style={{ fontSize: 13, color: "#b45309", marginBottom: 12 }}>
              Sin certificado no puedes emitir factura electrónica real. La simulación POS sigue operativa.
            </p>
          )}
          <Field label="Subir certificado" hint="Archivo .p12 emitido por DIAN o entidad certificadora">
            <input type="file" accept=".p12,.pfx" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCert(f); e.target.value = ""; }} />
          </Field>
        </AdminSection>

        <AdminSection title={`Resoluciones (${resolutions.length})`} actions={
          <button type="button" style={adminStyles.btnPrimary} onClick={() => { setForm(emptyForm()); setCreateModal(true); }}>+ Resolución</button>
        }>
          {resolutions.length === 0 ? (
            <EmptyState text="Sin resoluciones — necesaria para numeración fiscal." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Tipo</th>
                  <th style={adminStyles.th}>Prefijo</th>
                  <th style={adminStyles.th}>Rango</th>
                  <th style={adminStyles.th}>Vigencia</th>
                  <th style={adminStyles.th}>Actual</th>
                  <th style={adminStyles.th}>Estado</th>
                  <th style={adminStyles.th}></th>
                </tr>
              </thead>
              <tbody>
                {resolutions.map((f) => (
                  <tr key={f.id}>
                    <td style={adminStyles.td}>{docLabel(f.docType)}</td>
                    <td style={adminStyles.td}><strong>{f.prefix}</strong></td>
                    <td style={adminStyles.td}>{f.fromNumber} – {f.toNumber}</td>
                    <td style={adminStyles.td}>{new Date(f.validFrom).toLocaleDateString("es-CO")} → {new Date(f.validTo).toLocaleDateString("es-CO")}</td>
                    <td style={adminStyles.td}>{f.currentNumber}</td>
                    <td style={adminStyles.td}><Badge ok={f.isActive} label={f.isActive ? "Activa" : "Inactiva"} /></td>
                    <td style={adminStyles.td}>
                      <button type="button" style={adminStyles.btnSecondary} onClick={() => openEdit(f)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        {createModal && (
          <AdminModal title="Nueva resolución" onClose={() => setCreateModal(false)} footer={
            <ModalFooter onCancel={() => setCreateModal(false)} onSave={async () => {
              setSaving(true);
              await runAction(async () => {
                await api.post("/v1/admin/fiscal-resolutions", form);
                setCreateModal(false);
                await reload();
              }, "Resolución creada");
              setSaving(false);
            }} saving={saving} saveLabel="Crear" />
          }>
            <ResolutionForm form={form} setForm={setForm} showDocType />
          </AdminModal>
        )}

        {editModal && (
          <AdminModal title={`Editar resolución ${editModal.prefix}`} onClose={() => setEditModal(null)} footer={
            <ModalFooter onCancel={() => setEditModal(null)} onSave={async () => {
              setSaving(true);
              await runAction(async () => {
                await api.patch(`/v1/admin/fiscal-resolutions/${editModal.id}`, {
                  prefix: form.prefix,
                  fromNumber: form.fromNumber,
                  toNumber: form.toNumber,
                  validFrom: form.validFrom || undefined,
                  validTo: form.validTo || undefined,
                  technicalKey: form.technicalKey || undefined,
                  isActive: form.isActive,
                });
                setEditModal(null);
                await reload();
              }, "Resolución actualizada");
              setSaving(false);
            }} saving={saving} />
          }>
            <ResolutionForm form={form} setForm={setForm} showActive />
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}

function ResolutionForm({
  form,
  setForm,
  showDocType,
  showActive,
}: {
  form: ReturnType<typeof emptyForm>;
  setForm: (f: ReturnType<typeof emptyForm>) => void;
  showDocType?: boolean;
  showActive?: boolean;
}) {
  return (
    <>
      {showDocType && (
        <Field label="Tipo documento">
          <select style={adminStyles.select} value={form.docType} onChange={(e) => setForm({ ...form, docType: e.target.value })}>
            {DOC_TYPES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
          </select>
        </Field>
      )}
      <Field label="Prefijo"><input style={adminStyles.input} value={form.prefix} onChange={(e) => setForm({ ...form, prefix: e.target.value })} /></Field>
      <div className={adminStyles.grid2}>
        <Field label="Desde número"><input type="number" style={adminStyles.input} value={form.fromNumber} onChange={(e) => setForm({ ...form, fromNumber: Number(e.target.value) })} /></Field>
        <Field label="Hasta número"><input type="number" style={adminStyles.input} value={form.toNumber} onChange={(e) => setForm({ ...form, toNumber: Number(e.target.value) })} /></Field>
        <Field label="Vigencia desde"><input type="date" style={adminStyles.input} value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} /></Field>
        <Field label="Vigencia hasta"><input type="date" style={adminStyles.input} value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} /></Field>
      </div>
      <Field label="Clave técnica (CUFE)" hint="Proporcionada por DIAN en habilitación">
        <input style={adminStyles.input} value={form.technicalKey} onChange={(e) => setForm({ ...form, technicalKey: e.target.value })} />
      </Field>
      {showActive && (
        <CheckboxField label="Resolución activa" checked={form.isActive} onChange={(v) => setForm({ ...form, isActive: v })} />
      )}
    </>
  );
}
