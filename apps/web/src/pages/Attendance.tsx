import { useCallback, useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import { api } from "../lib/api";
import { getStoredAuth } from "../lib/auth";
import { canManageStaffShifts } from "../lib/permissions";

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

type BiometricCredential = {
  id: string;
  deviceName?: string | null;
  createdAt: string;
  lastUsedAt?: string | null;
};

type ClockResult = {
  action: "clock-in" | "clock-out";
  userName: string;
  clockInAt: string;
  clockOutAt?: string;
  hours?: number;
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
  const isManager = !!user && canManageStaffShifts(user);
  const [home, setHome] = useState<Home | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [credentials, setCredentials] = useState<BiometricCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [pinBusy, setPinBusy] = useState(false);
  const [lastResult, setLastResult] = useState<ClockResult | null>(null);
  const [tick, setTick] = useState(0);

  const webAuthnOk = browserSupportsWebAuthn() && window.isSecureContext;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [homeRes, boardRes, credsRes] = await Promise.all([
        api.get("/v1/staff-shifts/home"),
        isManager
          ? api.get("/v1/staff-shifts/board").catch(() => ({ data: null }))
          : Promise.resolve({ data: null }),
        api.get("/v1/staff-shifts/biometric/credentials").catch(() => ({ data: [] })),
      ]);
      setHome(homeRes.data);
      setBoard(boardRes.data);
      setCredentials(credsRes.data ?? []);
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

  function showResult(result: ClockResult) {
    setLastResult(result);
    setTimeout(() => setLastResult(null), 8000);
  }

  async function clockWithFingerprint() {
    setBioBusy(true);
    try {
      const opts = await api.post("/v1/staff-shifts/biometric/clock-options", {});
      const assertion = await startAuthentication({ optionsJSON: opts.data.options });
      const res = await api.post("/v1/staff-shifts/biometric/clock-verify", {
        sessionId: opts.data.sessionId,
        response: assertion,
      });
      showResult(res.data);
      await load();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        alert("Lectura de huella cancelada o no reconocida.");
      } else {
        alert(err.response?.data?.message ?? "No se pudo marcar con huella");
      }
    } finally {
      setBioBusy(false);
    }
  }

  async function enrollFingerprint() {
    setEnrollBusy(true);
    try {
      const opts = await api.post("/v1/staff-shifts/biometric/register-options", {});
      const attestation = await startRegistration({ optionsJSON: opts.data });
      await api.post("/v1/staff-shifts/biometric/register-verify", {
        response: attestation,
        deviceName: navigator.platform || "Dispositivo",
      });
      alert("Huella registrada. Ya puedes marcar asistencia con ella en este equipo.");
      await load();
    } catch (err: any) {
      if (err?.name === "NotAllowedError") {
        alert("Registro cancelado.");
      } else if (err?.name === "InvalidStateError") {
        alert("Esta huella ya estaba registrada en este equipo.");
      } else {
        alert(err.response?.data?.message ?? "No se pudo registrar la huella");
      }
    } finally {
      setEnrollBusy(false);
    }
  }

  async function clockWithPinCode() {
    if (!pin.trim()) return;
    setPinBusy(true);
    try {
      const res = await api.post("/v1/staff-shifts/clock-pin", { pin: pin.trim() });
      setPin("");
      showResult(res.data);
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo marcar con PIN");
    } finally {
      setPinBusy(false);
    }
  }

  async function clockMySession() {
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
        Marca tu <strong>llegada</strong> y <strong>salida</strong> al trabajo. Con la huella el sistema
        te identifica, valida si estás habilitado y alterna llegada/salida automáticamente.
      </p>

      {lastResult && (
        <div
          style={{
            background: lastResult.action === "clock-in" ? "var(--t-success-soft, #dcfce7)" : "#fef3c7",
            border: `1px solid ${lastResult.action === "clock-in" ? "var(--t-success-fg, #166534)" : "#b45309"}`,
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>
            {lastResult.action === "clock-in" ? "✅ Llegada registrada" : "👋 Salida registrada"}
          </div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {lastResult.userName}
            {lastResult.action === "clock-out" && lastResult.hours != null
              ? ` · trabajaste ${formatElapsed(lastResult.hours)}`
              : ` · ${new Date(lastResult.clockInAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`}
          </div>
        </div>
      )}

      <div
        style={{
          background: "var(--t-card)",
          border: "1px solid var(--t-border)",
          borderRadius: 16,
          padding: 24,
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Reloj de marcación</div>
        <p style={{ margin: "0 0 16px", fontSize: 13, color: "var(--t-muted)" }}>
          Cualquier empleado puede marcar aquí con su huella{webAuthnOk ? "" : " (no disponible en este equipo)"} o su PIN.
        </p>

        <button
          type="button"
          disabled={bioBusy || !webAuthnOk}
          onClick={clockWithFingerprint}
          style={{
            padding: "18px 32px",
            borderRadius: 14,
            border: "none",
            fontSize: 18,
            fontWeight: 700,
            cursor: webAuthnOk ? "pointer" : "not-allowed",
            background: webAuthnOk ? "var(--t-primary)" : "var(--t-border)",
            color: "var(--t-primary-fg, #fff)",
            minWidth: 260,
            opacity: bioBusy ? 0.7 : 1,
          }}
        >
          {bioBusy ? "Leyendo huella…" : "👆 Marcar con huella"}
        </button>

        {!webAuthnOk && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--t-warn-fg, #b45309)" }}>
            La huella requiere HTTPS (o un equipo con sensor compatible). Usa el PIN mientras tanto.
          </p>
        )}

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          <input
            inputMode="numeric"
            placeholder="PIN de empleado"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => e.key === "Enter" && clockWithPinCode()}
            style={{
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--t-border-strong)",
              fontSize: 16,
              width: 160,
              textAlign: "center",
            }}
          />
          <button
            type="button"
            disabled={pinBusy || !pin.trim()}
            onClick={clockWithPinCode}
            style={{
              padding: "10px 18px",
              borderRadius: 10,
              border: "1px solid var(--t-border-strong)",
              background: "var(--t-card)",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {pinBusy ? "…" : "Marcar con PIN"}
          </button>
        </div>
      </div>

      <div
        style={{
          background: open ? "var(--t-success-soft, #dcfce7)" : "var(--t-card)",
          border: `1px solid ${open ? "var(--t-success-fg, #166534)" : "var(--t-border)"}`,
          borderRadius: 16,
          padding: 20,
          marginBottom: 20,
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 6 }}>
          Mi sesión: {user?.name ?? "Tu usuario"} · {home?.today}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>
          {open ? `En el local · ${formatElapsed(elapsed)}` : "Fuera de turno"}
        </div>
        {clockInAt && (
          <div style={{ fontSize: 13, color: "var(--t-muted)", marginBottom: 12 }}>
            Llegaste a las {clockInAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            type="button"
            disabled={busy}
            onClick={clockMySession}
            style={{
              padding: "10px 20px",
              borderRadius: 10,
              border: "none",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
              background: open ? "var(--t-red-fg, #dc2626)" : "var(--t-primary)",
              color: "var(--t-primary-fg, #fff)",
            }}
          >
            {busy ? "Guardando…" : open ? "Marcar salida" : "Marcar llegada"}
          </button>
          {webAuthnOk && (
            <button
              type="button"
              disabled={enrollBusy}
              onClick={enrollFingerprint}
              style={{
                padding: "10px 20px",
                borderRadius: 10,
                border: "1px solid var(--t-border-strong)",
                background: "var(--t-card)",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              {enrollBusy
                ? "Registrando…"
                : credentials.length > 0
                  ? "➕ Registrar otra huella"
                  : "👆 Registrar mi huella"}
            </button>
          )}
        </div>
        {credentials.length > 0 && (
          <div style={{ marginTop: 12, fontSize: 12, color: "var(--t-muted)" }}>
            Huellas registradas: {credentials.length}
            {" · "}
            <button
              type="button"
              onClick={async () => {
                if (!confirm("¿Eliminar todas tus huellas registradas?")) return;
                for (const c of credentials) {
                  await api.delete(`/v1/staff-shifts/biometric/credentials/${c.id}`).catch(() => {});
                }
                await load();
              }}
              style={{ border: "none", background: "transparent", color: "var(--t-danger-fg, #b91c1c)", cursor: "pointer", fontSize: 12, textDecoration: "underline" }}
            >
              eliminar
            </button>
          </div>
        )}
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
