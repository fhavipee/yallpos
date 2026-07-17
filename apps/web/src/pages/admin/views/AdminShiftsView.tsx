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
  EmptyState,
  Field,
  ModalFooter,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function weekAheadISO() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

type ShiftReport = {
  from: string;
  to: string;
  summary: { shiftCount: number; openCount: number; totalHours: number };
  byUser: { userId: string; userName: string; hours: number; shifts: number; open: number }[];
  shifts: {
    id: string;
    userName: string;
    clockInAt: string;
    clockOutAt?: string | null;
    open: boolean;
    hours: number;
    notes?: string | null;
  }[];
};

type ScheduleRow = {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  label?: string | null;
  notes?: string | null;
};

type UserOpt = { id: string; name: string; role: string; isActive: boolean };

const LABELS = ["Almuerzo", "Cena", "Mañana", "Tarde", "Noche", "Completo"];

export default function AdminShiftsView() {
  const runAction = useAdminAction();
  const [from, setFrom] = useState(todayISO);
  const [to, setTo] = useState(todayISO);
  const [schedFrom, setSchedFrom] = useState(todayISO);
  const [schedTo, setSchedTo] = useState(weekAheadISO);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    userId: "",
    workDate: todayISO(),
    startTime: "11:00",
    endTime: "15:00",
    label: "Almuerzo",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const { data, loading, error, reload } = useAdminResource(async () => {
    const r = await api.get("/v1/staff-shifts", { params: { from, to } });
    return r.data as ShiftReport;
  }, [from, to]);

  const {
    data: schedules,
    loading: schedLoading,
    reload: reloadSched,
  } = useAdminResource(async () => {
    const r = await api.get("/v1/staff-shifts/schedule", { params: { from: schedFrom, to: schedTo } });
    return (r.data?.schedules ?? []) as ScheduleRow[];
  }, [schedFrom, schedTo]);

  const { data: users } = useAdminResource(async () => {
    const r = await api.get("/v1/admin/users");
    return (r.data as UserOpt[]).filter((u) => u.isActive);
  }, []);

  const openNow = (data?.shifts ?? []).filter((s) => s.open);

  async function saveSchedule() {
    if (!form.userId) return alert("Elige una persona");
    setSaving(true);
    await runAction(async () => {
      await api.post("/v1/staff-shifts/schedule", {
        userId: form.userId,
        workDate: form.workDate,
        startTime: form.startTime,
        endTime: form.endTime,
        label: form.label || undefined,
        notes: form.notes.trim() || undefined,
      });
      setModal(false);
      await reloadSched();
    }, "Turno programado");
    setSaving(false);
  }

  return (
    <AdminViewGate loading={loading && schedLoading} error={error} onRetry={() => { reload(); reloadSched(); }}>
      <>
        <AdminPageHeader
          title="Asistencia y turnos"
          desc="Programa quién debe trabajar y revisa llegadas/salidas reales. El equipo ficha en el módulo Asistencia (menú principal)."
          actions={<ReloadButton onClick={() => { reload(); reloadSched(); }} />}
        />

        <div
          style={{
            background: "var(--t-card-alt)",
            border: "1px solid var(--t-border)",
            borderRadius: 12,
            padding: 14,
            marginBottom: 16,
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--t-muted)",
          }}
        >
          <strong style={{ color: "var(--t-fg)" }}>Dos piezas distintas</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
            <li><strong>Programación:</strong> turnos que asignas aquí (quién debe venir).</li>
            <li><strong>Asistencia real:</strong> llegada/salida que marca cada persona en el módulo Asistencia.</li>
          </ul>
        </div>

        <AdminSection
          title="Programación de turnos"
          actions={
            <button
              type="button"
              style={adminStyles.btnPrimary}
              onClick={() => {
                setForm({
                  userId: users?.[0]?.id ?? "",
                  workDate: todayISO(),
                  startTime: "11:00",
                  endTime: "15:00",
                  label: "Almuerzo",
                  notes: "",
                });
                setModal(true);
              }}
            >
              + Programar turno
            </button>
          }
        >
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Desde
              <input type="date" value={schedFrom} onChange={(e) => setSchedFrom(e.target.value)} style={adminStyles.input} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Hasta
              <input type="date" value={schedTo} onChange={(e) => setSchedTo(e.target.value)} style={adminStyles.input} />
            </label>
            <button type="button" style={adminStyles.btnSecondary} onClick={reloadSched}>Consultar</button>
          </div>
          {(schedules ?? []).length === 0 ? (
            <EmptyState text="Sin turnos programados en este rango. Usa «+ Programar turno»." />
          ) : (
            <table style={adminStyles.table}>
              <thead>
                <tr>
                  <th style={adminStyles.th}>Fecha</th>
                  <th style={adminStyles.th}>Persona</th>
                  <th style={adminStyles.th}>Horario</th>
                  <th style={adminStyles.th}>Etiqueta</th>
                  <th style={adminStyles.th} />
                </tr>
              </thead>
              <tbody>
                {(schedules ?? []).map((s) => (
                  <tr key={s.id}>
                    <td style={adminStyles.td}>{s.workDate}</td>
                    <td style={adminStyles.td}>{s.userName}</td>
                    <td style={adminStyles.td}>{s.startTime} – {s.endTime}</td>
                    <td style={adminStyles.td}>{s.label || "—"}</td>
                    <td style={adminStyles.td}>
                      <button
                        type="button"
                        style={adminStyles.btnDanger}
                        onClick={() =>
                          runAction(async () => {
                            await api.delete(`/v1/staff-shifts/schedule/${s.id}`);
                            await reloadSched();
                          }, "Turno eliminado")
                        }
                      >
                        Quitar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </AdminSection>

        <AdminSection title="Asistencia real (fichajes)">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginBottom: 12 }}>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Desde
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={adminStyles.input} />
            </label>
            <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
              Hasta
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={adminStyles.input} />
            </label>
            <button
              type="button"
              style={adminStyles.btnSecondary}
              onClick={() => { setFrom(todayISO()); setTo(todayISO()); }}
            >
              Hoy
            </button>
            <button type="button" style={adminStyles.btnSecondary} onClick={reload}>Consultar</button>
          </div>
        </AdminSection>

        {data && (
          <>
            <AdminSection title={`Ahora en el local (${openNow.length})`}>
              {openNow.length === 0 ? (
                <EmptyState text="Nadie tiene llegada marcada sin salida." />
              ) : (
                <table style={adminStyles.table}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Persona</th>
                      <th style={adminStyles.th}>Llegó</th>
                      <th style={adminStyles.th}>Lleva</th>
                      <th style={adminStyles.th} />
                    </tr>
                  </thead>
                  <tbody>
                    {openNow.map((s) => (
                      <tr key={s.id}>
                        <td style={adminStyles.td}>
                          {s.userName} <Badge ok={false} label="En local" />
                        </td>
                        <td style={adminStyles.td}>
                          {new Date(s.clockInAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td style={adminStyles.td}>{s.hours} h</td>
                        <td style={adminStyles.td}>
                          <button
                            type="button"
                            style={adminStyles.btnDanger}
                            onClick={() =>
                              runAction(async () => {
                                await api.post(`/v1/staff-shifts/${s.id}/force-clock-out`, {
                                  notes: "Cierre forzado desde admin",
                                });
                                await reload();
                              }, "Salida registrada")
                            }
                          >
                            Marcar salida por él
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>

            <AdminSection title="Horas por persona (nómina)">
              {data.byUser.length === 0 ? (
                <EmptyState text="Sin fichajes en este periodo." />
              ) : (
                <table style={adminStyles.table}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Persona</th>
                      <th style={adminStyles.th}>Jornadas</th>
                      <th style={adminStyles.th}>Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byUser.map((u) => (
                      <tr key={u.userId}>
                        <td style={adminStyles.td}>{u.userName}</td>
                        <td style={adminStyles.td}>{u.shifts}</td>
                        <td style={adminStyles.td}><strong>{u.hours} h</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>

            <AdminSection title="Historial de llegadas y salidas">
              {data.shifts.length === 0 ? (
                <EmptyState text="Sin registros." />
              ) : (
                <table style={adminStyles.table}>
                  <thead>
                    <tr>
                      <th style={adminStyles.th}>Persona</th>
                      <th style={adminStyles.th}>Llegada</th>
                      <th style={adminStyles.th}>Salida</th>
                      <th style={adminStyles.th}>Horas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((s) => (
                      <tr key={s.id}>
                        <td style={adminStyles.td}>
                          {s.userName} {s.open && <Badge ok={false} label="Sin salida" />}
                        </td>
                        <td style={adminStyles.td}>{new Date(s.clockInAt).toLocaleString("es-CO")}</td>
                        <td style={adminStyles.td}>
                          {s.clockOutAt ? new Date(s.clockOutAt).toLocaleString("es-CO") : "—"}
                        </td>
                        <td style={adminStyles.td}>{s.hours} h</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </AdminSection>
          </>
        )}

        {modal && (
          <AdminModal
            title="Programar turno"
            onClose={() => setModal(false)}
            footer={
              <ModalFooter
                onCancel={() => setModal(false)}
                onSave={saveSchedule}
                saving={saving}
                saveLabel="Guardar turno"
                disabled={!form.userId}
              />
            }
          >
            <Field label="Persona">
              <select
                value={form.userId}
                onChange={(e) => setForm({ ...form, userId: e.target.value })}
                style={adminStyles.input}
              >
                <option value="">Selecciona…</option>
                {(users ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                ))}
              </select>
            </Field>
            <Field label="Fecha">
              <input
                type="date"
                value={form.workDate}
                onChange={(e) => setForm({ ...form, workDate: e.target.value })}
                style={adminStyles.input}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Desde">
                <input
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  style={adminStyles.input}
                />
              </Field>
              <Field label="Hasta">
                <input
                  type="time"
                  value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  style={adminStyles.input}
                />
              </Field>
            </div>
            <Field label="Etiqueta">
              <select
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                style={adminStyles.input}
              >
                {LABELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Field>
            <Field label="Notas">
              <input
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                style={adminStyles.input}
                placeholder="Opcional"
              />
            </Field>
          </AdminModal>
        )}
      </>
    </AdminViewGate>
  );
}
