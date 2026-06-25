import { Fragment, useState } from "react";
import { api } from "../../../lib/api";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  EmptyState,
  Field,
  IdChip,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

const ENTITY_LABELS: Record<string, string> = {
  branch: "Sucursal",
  company: "Empresa",
  category: "Categoría",
  dining_area: "Área",
  table: "Mesa",
  staff: "Personal",
  user: "Usuario",
  kds_station: "Estación KDS",
  kds_routing: "Ruta KDS",
  fiscal_resolution: "Resolución fiscal",
  fiscal_certificate: "Certificado fiscal",
  modifier_group: "Modificador",
  modifier_option: "Opción modificador",
  warehouse: "Bodega",
  stock_level: "Stock",
  branch_settings: "Config sucursal",
  cash_register: "Caja",
  onboarding_catalog: "Onboarding catálogo",
  tenant_role: "Rol custom",
};

type AuditEntry = {
  id: string;
  createdAt: string;
  action: string;
  entity: string;
  entityId?: string;
  userId?: string;
  payload?: Record<string, unknown>;
};

export default function AdminAuditView() {
  const [filter, setFilter] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: audit, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/audit-log?limit=100");
    return r.data as AuditEntry[];
  }, []);

  const filtered = (audit ?? []).filter((a) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return a.entity?.toLowerCase().includes(q) || a.action?.includes(q) || a.entityId?.includes(q);
  });

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader title="Auditoría" desc="Registro de cambios en parametrización (quién, qué, cuándo)." actions={<ReloadButton onClick={reload} />} />

        <AdminSection title="Filtrar">
          <Field label="Buscar en eventos">
            <input style={adminStyles.input} placeholder="Entidad, acción o ID…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </Field>
        </AdminSection>

        <AdminSection title={`${filtered.length} eventos`}>
          {filtered.length === 0 ? (
            <EmptyState text="Sin eventos de auditoría." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}></th>
                  <th style={adminStyles.th}>Fecha</th>
                  <th style={adminStyles.th}>Acción</th>
                  <th style={adminStyles.th}>Entidad</th>
                  <th style={adminStyles.th}>Referencia</th>
                  <th style={adminStyles.th}>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const expanded = expandedId === a.id;
                  const hasPayload = a.payload && Object.keys(a.payload).length > 0;
                  return (
                    <Fragment key={a.id}>
                      <tr>
                        <td style={adminStyles.td}>
                          {hasPayload && (
                            <button
                              type="button"
                              style={{ ...adminStyles.btnSecondary, padding: "2px 8px" }}
                              onClick={() => setExpandedId(expanded ? null : a.id)}
                            >
                              {expanded ? "▼" : "▶"}
                            </button>
                          )}
                        </td>
                        <td style={adminStyles.td}>{new Date(a.createdAt).toLocaleString("es-CO")}</td>
                        <td style={adminStyles.td}><code>{a.action}</code></td>
                        <td style={adminStyles.td}>{ENTITY_LABELS[a.entity] ?? a.entity}</td>
                        <td style={adminStyles.td}>{a.entityId ? <IdChip id={a.entityId} /> : "—"}</td>
                        <td style={adminStyles.td}>{a.userId ? <IdChip id={a.userId} /> : "Sistema"}</td>
                      </tr>
                      {expanded && hasPayload && (
                        <tr>
                          <td colSpan={6} style={{ ...adminStyles.td, background: "var(--t-card-alt)" }}>
                            <pre style={{ margin: 0, fontSize: 11, overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap" }}>
                              {JSON.stringify(a.payload, null, 2)}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </AdminSection>
      </>
    </AdminViewGate>
  );
}
