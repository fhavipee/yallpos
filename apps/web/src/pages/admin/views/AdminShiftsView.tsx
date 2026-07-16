import { useState } from "react";
import { api } from "../../../lib/api";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  Badge,
  EmptyState,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

type ShiftReport = {
  from: string;
  to: string;
  summary: { shiftCount: number; openCount: number; totalHours: number };
  byUser: { userId: string; userName: string; hours: number; shifts: number; open: number }[];
  shifts: {
    id: string;
    userName: string;
    role?: string | null;
    clockInAt: string;
    clockOutAt?: string | null;
    open: boolean;
    hours: number;
    notes?: string | null;
  }[];
};

export default function AdminShiftsView() {
  const runAction = useAdminAction();
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(todayISO);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/staff-shifts", { params: { from, to } });
    return r.data as ShiftReport;
  }, [from, to]);

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <>
        <AdminPageHeader
          title="Turnos / asistencia"
          desc="Fichaje de entrada y salida del personal con login. El botón Entrada/Salida está en la barra superior."
          actions={<ReloadButton onClick={reload} />}
        />

        <AdminSection title="Rango">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={adminStyles.input} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={adminStyles.input} />
            </label>
            <button type="button" style={adminStyles.btnSecondary} onClick={reload}>Consultar</button>
          </div>
        </AdminSection>

        {data && (
          <>
            <AdminSection title="Resumen">
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                <Stat label="Turnos" value={String(data.summary.shiftCount)} />
                <Stat label="Abiertos" value={String(data.summary.openCount)} />
                <Stat label="Horas" value={`${data.summary.totalHours} h`} />
              </div>
            </AdminSection>

            <AdminSection title="Por persona">
              {data.byUser.length === 0 ? (
                <EmptyState text="Sin fichajes en este rango." />
              ) : (
                <table style={adminStyles.table}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Persona</th>
                      <th style={adminStyles.th}>Turnos</th>
                      <th style={adminStyles.th}>Horas</th>
                      <th style={adminStyles.th}>Abiertos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((u) => (
                      <tr key={u.userId}>
                        <td style={adminStyles.td}>{u.userName}</td>
                        <td style={adminStyles.td}>{u.shifts}</td>
                        <td style={adminStyles.td}>{u.hours} h</td>
                        <td style={adminStyles.td}>
                          {u.open > 0 ? <Badge ok={false} label={`${u.open}`} /> : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>

            <AdminSection title="Detalle">
              {data.shifts.length === 0 ? (
                <EmptyState text="Sin registros." />
              ) : (
                <table style={adminStyles.table}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Persona</th>
                      <th style={adminStyles.th}>Entrada</th>
                      <th style={adminStyles.th}>Salida</th>
                      <th style={adminStyles.th}>Horas</th>
                      <th style={adminStyles.th}>Notas</th>
                      <th style={adminStyles.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((s) => (
                      <tr key={s.id}>
                        <td style={adminStyles.td}>
                          {s.userName}{" "}
                          {s.open && <Badge ok={false} label="Abierto" />}
                        </td>
                        <td style={adminStyles.td}>{new Date(s.clockInAt).toLocaleString("es-CO")}</td>
                        <td style={adminStyles.td}>
                          {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString("es-CO") : "—"}
                        </td>
                        <td style={adminStyles.td}>{s.hours} h</td>
                        <td style={adminStyles.td}>{s.notes || "—"}</td>
                        <td style={adminStyles.td}>
                          {s.open && (
                            <button
                              type="button"
                              style={adminStyles.btnDanger}
                              onClick={() =>
                                runAction(async () => {
                                  await api.post(`/v1/staff-shifts/${s.id}/force-clock-out`, {
                                    notes: "Cierre forzado desde admin",
                                  });
                                  await reload();
                                }, "Turno cerrado")
                              }
                            >
                              Forzar salida
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>
          </>
        )}
      </>
    </AdminViewGate>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "var(--t-card-alt)", borderRadius: 10, padding: 12 }}>
      <div style={{ fontSize: 12, color: "var(--t-muted)" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700 }}>{value}</div>
    </div>
  );
}
