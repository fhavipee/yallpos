import { useCallback, useEffect, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { floorTestClipboardText, loadFloorTestInfo, type FloorTestInfo } from "../lib/floorTest";
import { waiterKioskUrl } from "../lib/waiterKiosk";

type TrainingStep = {
  id: string;
  title: string;
  durationMin: number;
  summary: string;
  bullets: string[];
  tab?: string;
  optional?: boolean;
  done: boolean;
};

type TrainingState = {
  steps: TrainingStep[];
  progressPct: number;
  requiredDone: number;
  requiredTotal: number;
  estimatedMinutes: number;
  completed: boolean;
  readyToComplete: boolean;
};

export default function WaiterTraining({
  branchId,
  onOpenTab,
  onChecklistUpdated,
}: {
  branchId: string;
  onOpenTab?: (tab: string) => void;
  onChecklistUpdated?: (checklist: unknown) => void;
}) {
  const [data, setData] = useState<TrainingState | null>(null);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [floorInfo, setFloorInfo] = useState<FloorTestInfo | null>(null);

  const refresh = useCallback(async () => {
    const res = await api.get("/v1/onboarding/waiter-training");
    setData(res.data);
    return res.data as TrainingState;
  }, []);

  useEffect(() => {
    setBranchId(branchId);
    loadFloorTestInfo().then(setFloorInfo);
    refresh()
      .then((d) => {
        if (!d) return;
        const next = d.steps.find((s) => !s.done && !s.optional);
        if (next) setExpandedId(next.id);
      })
      .catch(() => setData(null));
  }, [branchId, refresh]);

  async function toggleStep(stepId: string, done: boolean) {
    setLoading(true);
    try {
      const res = await api.patch(`/v1/onboarding/waiter-training/${stepId}`, { done });
      setData(res.data);
    } finally {
      setLoading(false);
    }
  }

  async function completeTraining() {
    if (!data?.readyToComplete && !confirm("¿Marcar capacitación completa de todos modos?")) return;
    setLoading(true);
    try {
      const res = await api.post("/v1/onboarding/waiter-training/complete");
      setData(res.data.training);
      onChecklistUpdated?.(res.data.checklist);
      window.dispatchEvent(new CustomEvent("yallpos:ops-checklist-updated", { detail: res.data.checklist }));
      alert("✅ Capacitación registrada en el checklist go-live");
    } finally {
      setLoading(false);
    }
  }

  async function copyFloorCredentials() {
    const info = floorInfo ?? await loadFloorTestInfo();
    await navigator.clipboard.writeText(floorTestClipboardText(info));
    alert("Credenciales copiadas — pega en la tablet o comparte con el equipo");
  }

  if (!data) {
    return <div style={{ padding: 40, color: "var(--t-muted)" }}>Cargando guía…</div>;
  }

  return (
    <div style={{ maxWidth: 680 }}>
      <h2 style={{ margin: "0 0 8px" }}>Capacitación meseros</h2>
      <p style={{ color: "var(--t-muted)", margin: "0 0 20px", fontSize: 14 }}>
        Guía de ~{data.estimatedMinutes} minutos para operar Mesas, Comanda, Host y cobros.
        Marca cada paso cuando lo practiques en vivo.
      </p>

      <div style={{
        padding: 16,
        borderRadius: 12,
        marginBottom: 20,
        background: data.completed ? "#f0fdf4" : "#eff6ff",
        border: `1px solid ${data.completed ? "#86efac" : "#bfdbfe"}`,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>
              {data.completed ? "✅ Capacitación completada" : `${data.progressPct}% completado`}
            </div>
            <div style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 4 }}>
              {data.requiredDone} de {data.requiredTotal} pasos obligatorios
            </div>
          </div>
          {!data.completed && (
            <button
              onClick={completeTraining}
              disabled={loading}
              style={{
                padding: "10px 16px",
                borderRadius: 8,
                border: "none",
                background: data.readyToComplete ? "#16a34a" : "#94a3b8",
                color: "#fff",
                cursor: loading ? "wait" : "pointer",
                fontWeight: 600,
              }}
            >
              Finalizar capacitación
            </button>
          )}
        </div>
        <div style={{ height: 8, background: "var(--t-border)", borderRadius: 4, overflow: "hidden", marginTop: 12 }}>
          <div style={{
            height: "100%",
            width: `${data.progressPct}%`,
            background: data.completed ? "#16a34a" : "#2563eb",
          }} />
        </div>
      </div>

      {floorInfo && (
        <div style={{
          padding: 16,
          borderRadius: 12,
          marginBottom: 20,
          background: "var(--t-card-alt)",
          border: "1px solid var(--t-border)",
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Prueba en piso (tablet)</div>
          <div style={{ fontSize: 13, color: "var(--t-muted)", lineHeight: 1.7, marginBottom: 12 }}>
            <div><strong>URL:</strong> <code style={{ fontSize: 12 }}>{floorInfo.kioskUrl}</code></div>
            <div><strong>Login:</strong> {floorInfo.email} / {floorInfo.password}</div>
            <div><strong>PIN salida:</strong> {floorInfo.exitPin}</div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button type="button" onClick={() => window.open(waiterKioskUrl(), "_blank")} style={btnPrimary}>
              Abrir modo mesero
            </button>
            <button type="button" onClick={copyFloorCredentials} style={btnGhost}>
              Copiar credenciales
            </button>
            {onOpenTab && (
              <button type="button" onClick={() => onOpenTab("pilot")} style={btnGhost}>
                Ver checklist Piloto
              </button>
            )}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        {data.steps.map((step, index) => {
          const open = expandedId === step.id;
          return (
            <div
              key={step.id}
              style={{
                borderRadius: 12,
                border: `1px solid ${step.done ? "#bbf7d0" : "#e2e8f0"}`,
                background: step.done ? "#f0fdf4" : "#fff",
                overflow: "hidden",
              }}
            >
              <button
                type="button"
                onClick={() => setExpandedId(open ? null : step.id)}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 16px",
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <span style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: step.done ? "#16a34a" : "#e2e8f0",
                  color: step.done ? "#fff" : "#64748b",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 13,
                  fontWeight: 700,
                  flexShrink: 0,
                }}>
                  {step.done ? "✓" : index + 1}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>
                    {step.title}
                    {step.optional && (
                      <span style={{ fontSize: 11, color: "var(--t-muted)", fontWeight: 500, marginLeft: 8 }}>opcional</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 2 }}>
                    ~{step.durationMin} min · {step.summary}
                  </div>
                </div>
              </button>

              {open && (
                <div style={{ padding: "0 16px 16px 56px", fontSize: 14 }}>
                  <ul style={{ margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.6, color: "var(--t-fg)" }}>
                    {step.bullets.map((b) => (
                      <li key={b}>{b}</li>
                    ))}
                  </ul>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {step.tab && onOpenTab && (
                      <button
                        onClick={() => onOpenTab(step.tab!)}
                        style={btnPrimary}
                      >
                        Ir a {tabLabel(step.tab)}
                      </button>
                    )}
                    <button
                      onClick={() => toggleStep(step.id, !step.done)}
                      disabled={loading}
                      style={step.done ? btnGhost : btnPrimary}
                    >
                      {step.done ? "Desmarcar paso" : "Marcar practicado"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: 20 }}>
        Tip: haz la simulación en Piloto primero, luego repite cada paso con un mesero real.
      </p>
    </div>
  );
}

function tabLabel(tab: string) {
  const labels: Record<string, string> = {
    tables: "Mesas",
    order: "Comanda",
    host: "Host",
    kds: "KDS",
    dashboard: "Dashboard",
    settings: "Config",
  };
  return labels[tab] ?? tab;
}

const btnPrimary: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "none",
  background: "#2563eb",
  color: "#fff",
  cursor: "pointer",
  fontSize: 13,
};

const btnGhost: React.CSSProperties = {
  padding: "8px 14px",
  borderRadius: 8,
  border: "1px solid var(--t-border-strong)",
  background: "var(--t-card)",
  cursor: "pointer",
  fontSize: 13,
};
