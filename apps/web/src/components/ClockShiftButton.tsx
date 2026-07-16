import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";

type CurrentShift = {
  open: boolean;
  shift: {
    id: string;
    clockInAt: string;
    elapsedHours?: number;
  } | null;
};

export default function ClockShiftButton({ branchId }: { branchId: string }) {
  const [current, setCurrent] = useState<CurrentShift | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.get("/v1/staff-shifts/current");
      setCurrent(res.data);
    } catch {
      setCurrent(null);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [branchId, load]);

  async function toggle() {
    setBusy(true);
    try {
      if (current?.open) {
        await api.post("/v1/staff-shifts/clock-out", {});
      } else {
        await api.post("/v1/staff-shifts/clock-in", {});
      }
      await load();
    } catch (err: any) {
      alert(err.response?.data?.message ?? "No se pudo actualizar el turno");
    } finally {
      setBusy(false);
    }
  }

  const open = current?.open;
  const label = busy
    ? "…"
    : open
      ? "Salida"
      : "Entrada";

  const title = open && current?.shift?.clockInAt
    ? `En turno desde ${new Date(current.shift.clockInAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}`
    : "Fichar entrada / salida";

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      title={title}
      className="yall-icon-btn"
      style={{
        fontSize: 12,
        fontWeight: 600,
        padding: "4px 10px",
        minWidth: 64,
        background: open ? "var(--t-success-bg, #dcfce7)" : "var(--t-card)",
        color: open ? "var(--t-success-fg, #166534)" : "inherit",
        border: `1px solid ${open ? "var(--t-success-fg, #166534)" : "var(--t-border-strong)"}`,
      }}
    >
      {label}
    </button>
  );
}
