import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { getStoredAuth } from "../lib/auth";
import { canViewDashboard } from "../lib/permissions";

type ScheduleRow = {
  id: string;
  userId: string;
  userName: string;
  workDate: string;
  startTime: string;
  endTime: string;
  label?: string | null;
  status?: string;
};

type Board = {
  date: string;
  summary: { scheduledCount: number; presentCount: number; missingCount: number };
  scheduled: ScheduleRow[];
  present: {
    shiftId: string;
    userId: string;
    userName: string;
    clockInAt: string;
    hours: number;
    scheduled: boolean;
  }[];
};

type Home = {
  today: string;
  current: {
    open: boolean;
    shift: { clockInAt: string; elapsedHours?: number } | null;
  };
  myUpcomingSchedules: ScheduleRow[];
};

function formatElapsed(hours?: number) {
  if (hours == null || Number.isNaN(hours)) return "";
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h <= 0) return `${m} min`;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

const STATUS_LABEL: Record<string, string> = {
  present: "En local",
  left: "Ya salió",
  missing: "No ha llegado",
};

export default function Attendance({ branchId }: { branchId: string }) {
  const user = getStoredAuth()?.user;
  const isManager = !!user && canViewDashboard(user);
  const [home, setHome] = useState<Home | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [homeRes, boardRes] = await Promise.all([
        api.get("/v1/staff-shifts/home"),
        isManager
          ? api.get("/v1/staff-shifts/board").catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
      ]);
      setHome(homeRes.data);
      setBoard(boardRes.data);
    } finally {
      setLoading(false);
    }
  }, [isManager]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [branchId, load]);

  useEffect(() => {
    if (!home?.current?.open) return;
    const t = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, [home?.current?.open]);

  void tick;

  const open = !!home?.current?.open;
  const clockInAt = home?.current?.shift?.clockInAt
    ? new Date(home.current.shift.clockInAt)
    : null;
  const elapsed = clockInAt
    ? (Date.now() - clockInAt.getTime()) / 3_600_000
    : home?.current?.shift?.elapsedHours;

  async function clock() {
    const msg = open
      ? `¿Marcar salida? Llevas ${formatElapsed(elapsed)} en el local.`
      : "¿Marcar llegada al trabajo? Quedarás registrado como presente en esta sucursal.";
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      if (open) {
        const res = await api.post("/v1/staff-shifts/clock-out", {});
        alert(
          res.data?.shift?.hours != null
            ? `Salida OK. Trabajaste ${formatElapsed(res.data.shift.hours)}.`
            : "Salida registrada.",
        );
      } else {
        await api.post("/v1/staff-shifts/clock-in", {});
        alert("Llegada registrada. Buen turno.");
      }
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo registrar");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !home) return <div>Cargando asistencia…</div>;

  return (
    <div style={{ maxWidth: 880, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 6px" }}>Asistencia</h2>
      <p style={{ margin: "0 0 20px", color: "var(--t-muted)", fontSize: 14, lineHeight: 1.45 }}>
        Marca aquí tu <strong>llegada</strong> y <strong>salida</strong> al trabajo.
        No es abrir caja: esto es tu asistencia. La gerencia ve quién está en el local y lo compara con los turnos programados.
      </p>

      <div
        style={{
          background: open ? "var(--t-success-soft, #dcfce7)" : "var(--t-card)",
          border: `1px solid ${open ? "var(--t-success-fg, #166534)" : "var(--t-border)"}`,
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 8 }}>
          {user?.name ?? "Tu usuario"} · {home?.today}
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>
          {open ? `En el local · ${formatElapsed(elapsed)}` : "Fuera de turno"}
        </div>
        {clockInAt && (
          <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 16 }}>
            Llegaste a las {clockInAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={clock}
          style={{
            padding: "14px 28px",
            borderRadius: 12,
            border: "none",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
            background: open ? "var(--t-red-fg, #dc2626)" : "var(--t-primary)",
            color: "var(--t-primary-fg, #fff)",
            minWidth: 220,
          }}
        >
          {busy ? "Guardando…" : open ? "Marcar salida" : "Marcar llegada"}
        </button>
      </div>

      <section style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 16, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 10px", fontSize: 15 }}>Mis turnos programados (próximos 7 días)</h3>
        {(home?.myUpcomingSchedules?.length ?? 0) === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "var(--t-muted)" }}>
            Aún no tienes turnos asignados. El gerente los programa en Admin → Asistencia.
          </p>
        ) : (
          home!.myUpcomingSchedules.map((s) => (
            <div
              key={s.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                fontSize: 14,
                padding: "8px 0",
                borderBottom: "1px solid var(--t-border)",
              }}
            >
              <span>
                <strong>{s.workDate}</strong>
                {s.label ? ` · ${s.label}` : ""}
              </span>
              <span style={{ color: "var(--t-muted)" }}>
                {s.startTime} – {s.endTime}
              </span>
            </div>
          ))
        )}
      </section>

      {isManager && board && (
        <section style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: "0 0 6px", fontSize: 15 }}>Vista gerencia — hoy</h3>
          <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--t-muted)" }}>
            Programados {board.summary.scheduledCount} · En local {board.summary.presentCount} · Sin llegar {board.summary.missingCount}
          </p>

          <h4 style={{ margin: "0 0 8px", fontSize: 13 }}>En el local ahora</h4>
          {board.present.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--t-muted)" }}>Nadie ha marcado llegada.</p>
          ) : (
            board.present.map((p) => (
              <div key={p.shiftId} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                <span>
                  {p.userName}
                  {!p.scheduled && (
                    <span style={{ marginLeft: 6, fontSize: 11, color: "var(--t-warn-fg, #b45309)" }}>(no programado)</span>
                  )}
                </span>
                <span style={{ color: "var(--t-muted)" }}>
                  {new Date(p.clockInAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })} · {p.hours} h
                </span>
              </div>
            ))
          )}

          <h4 style={{ margin: "16px 0 8px", fontSize: 13 }}>Turnos programados vs asistencia</h4>
          {board.scheduled.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--t-muted)", margin: 0 }}>
              Sin programación para hoy. Crea turnos en Admin → Asistencia.
            </p>
          ) : (
            board.scheduled.map((s) => (
              <div key={s.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6, gap: 8 }}>
                <span>
                  {s.userName}
                  {s.label ? ` · ${s.label}` : ""} · {s.startTime}–{s.endTime}
                </span>
                <strong style={{
                  color: s.status === "present" ? "var(--t-success-fg, #166534)"
                    : s.status === "missing" ? "var(--t-danger-fg, #b91c1c)"
                    : "var(--t-muted)",
                  fontSize: 12,
                }}>
                  {STATUS_LABEL[s.status ?? ""] ?? s.status}
                </strong>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}
