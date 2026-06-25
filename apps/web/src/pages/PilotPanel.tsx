import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { floorTestClipboardText, loadFloorTestInfo, type FloorTestInfo } from "../lib/floorTest";
import { waiterKioskUrl } from "../lib/waiterKiosk";
import { getPrintAgentStatus, openDemoReceipt, testPrintAgent } from "../lib/print";

type Props = {
  companyId?: string;
  branchId?: string;
  onSelectBranch?: (branchId: string) => void;
  onOpenTab?: (tab: string) => void;
};

export default function PilotPanel({ companyId, branchId, onSelectBranch, onOpenTab }: Props) {
  const [fiscal, setFiscal] = useState<any>(null);
  const [pilot, setPilot] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [printAgent, setPrintAgent] = useState<{ ok: boolean; cash?: string; kitchen?: string; dual?: boolean; printer?: string } | null>(null);
  const [checklist, setChecklist] = useState<any>(null);
  const [opsChecklist, setOpsChecklist] = useState<any>(null);
  const [opsChecklistLoading, setOpsChecklistLoading] = useState(false);
  const [opsSummary, setOpsSummary] = useState<any>(null);

  useEffect(() => {
    api.get("/v1/fiscal/config").then((r) => setFiscal(r.data)).catch(() => {});
    getPrintAgentStatus().then(setPrintAgent);
  }, []);

  useEffect(() => {
    if (!branchId) return;
    api.get(`/v1/fiscal/habilitation/checklist?branchId=${branchId}`)
      .then((r) => setChecklist(r.data))
      .catch(() => {});
  }, [branchId]);

  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [floorInfo, setFloorInfo] = useState<FloorTestInfo | null>(null);

  useEffect(() => {
    loadFloorTestInfo().then(setFloorInfo);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail) {
        setOpsChecklist(detail);
        return;
      }
      if (!branchId) return;
      api.get("/v1/onboarding/operational-checklist")
        .then((r) => setOpsChecklist(r.data))
        .catch(() => setOpsChecklist(null));
    };
    window.addEventListener("yallpos:ops-checklist-updated", handler);
    return () => window.removeEventListener("yallpos:ops-checklist-updated", handler);
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    api.get("/v1/onboarding/operational-checklist")
      .then((r) => setOpsChecklist(r.data))
      .catch(() => setOpsChecklist(null));
  }, [branchId]);

  useEffect(() => {
    if (!branchId) return;
    Promise.all([
      api.get("/v1/pos/host-board"),
      api.get("/v1/reports/table-service-times"),
    ]).then(([host, times]) => {
      setOpsSummary({
        pendingCount: host.data.pendingCount ?? 0,
        overdueCount: host.data.overdueCount ?? 0,
        maxWaitMinutes: host.data.longestPendingMinutes ?? 0,
        servedToday: times.data.summary?.servedCount ?? 0,
        avgWaitMinutes: times.data.summary?.avgWaitMinutes ?? 0,
        slaCompliancePct: times.data.summary?.sla?.compliancePct ?? 100,
        slaMinutes: times.data.summary?.sla?.slaMinutes ?? 8,
        slaByWaiter: times.data.slaByWaiter ?? [],
      });
    }).catch(() => setOpsSummary(null));
  }, [branchId]);

  useEffect(() => {
    if (!companyId) return;
    api.get(`/v1/onboarding/pilot-status/${companyId}`).then((r) => setPilot(r.data)).catch(() => {});
  }, [companyId]);

  async function sendHabilitationTest() {
    if (!branchId) return alert("Selecciona una sucursal primero");
    setLoading(true);
    try {
      const res = await api.post(`/v1/fiscal/habilitation/test-set?branchId=${branchId}`);
      setTestResult(res.data);
      alert(`Set enviado\nTrack: ${res.data.trackId ?? "OK"}`);
    } catch (e: any) {
      alert(e.response?.data?.message ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  async function retryPending() {
    if (!branchId) return;
    setLoading(true);
    try {
      const res = await api.post(`/v1/fiscal/retry-pending?branchId=${branchId}`);
      alert(`Reintentados: ${res.data.length} documentos`);
    } finally {
      setLoading(false);
    }
  }

  async function syncMenu() {
    setLoading(true);
    try {
      const res = await api.post("/v1/pilot/sync-menu");
      alert(
        `Menú sincronizado\n` +
        `Categorías: ${res.data.menuCategories ?? "?"}\n` +
        `Nuevos: ${res.data.created}\n` +
        `Actualizados: ${res.data.updated}\n` +
        `Desactivados: ${res.data.deactivated ?? 0}\n` +
        `Activos: ${res.data.activeProducts}`
      );
      await refreshOpsChecklist();
    } catch (e: any) {
      alert(e.response?.data?.message ?? e.message);
    } finally {
      setLoading(false);
    }
  }

  async function markPrintTestDone() {
    if (!branchId) return;
    if (opsChecklist?.items?.find((i: any) => i.id === "print_test")?.ok) return;
    try {
      const res = await api.patch("/v1/onboarding/operational-checklist/print_test", { done: true });
      setOpsChecklist(res.data);
      window.dispatchEvent(new CustomEvent("yallpos:ops-checklist-updated", { detail: res.data }));
    } catch {
      // checklist opcional si falla
    }
  }

  async function testNetworkPrint() {
    setLoading(true);
    try {
      const res = await api.post("/v1/print/test");
      if (res.data.ok) await markPrintTestDone();
      alert(res.data.ok ? res.data.message : res.data.message ?? "Sin impresora configurada");
    } catch (e: any) {
      alert(e.response?.data?.message ?? "Configure PRINTER_IP en apps/api/.env");
    } finally {
      setLoading(false);
    }
  }

  async function testAgentPrint() {
    setLoading(true);
    try {
      const result = await testPrintAgent();
      if (result.ok) {
        await markPrintTestDone();
        alert(`✅ Tiquete de prueba enviado al Print Agent (${result.bytes} bytes)`);
      } else {
        alert(result.error ?? "Print Agent no respondió — inicie apps/print-agent con PRINTER_IP");
      }
      await refreshPrintAgent();
    } finally {
      setLoading(false);
    }
  }

  async function refreshPrintAgent() {
    setPrintAgent(await getPrintAgentStatus());
  }

  async function runOperationalSimulation() {
    if (!branchId) return alert("Selecciona una sucursal primero");
    if (!confirm(
      "¿Ejecutar simulación completa?\n\n" +
      "Abrirá mesa, enviará a cocina, cobrará, venderá en mostrador y cerrará/reabrirá caja.\n" +
      "Usa una mesa libre (preferencia M2).",
    )) return;

    setLoading(true);
    setSimulationResult(null);
    try {
      const res = await api.post("/v1/pilot/simulate-operational-flow");
      setSimulationResult(res.data);
      setOpsChecklist(res.data.checklist);
      alert(
        res.data.ok
          ? "✅ Simulación completada — checklist operativo listo"
          : "Simulación ejecutada — revisa pasos pendientes en el checklist",
      );
    } catch (e: any) {
      alert(e.response?.data?.message ?? e.message ?? "Falló la simulación");
    } finally {
      setLoading(false);
    }
  }

  async function copyFloorCredentials() {
    const info = floorInfo ?? await loadFloorTestInfo();
    await navigator.clipboard.writeText(floorTestClipboardText(info));
    alert("Credenciales copiadas para la tablet del salón");
  }

  async function refreshOpsChecklist() {
    if (!branchId) return;
    setOpsChecklistLoading(true);
    try {
      const res = await api.get("/v1/onboarding/operational-checklist");
      setOpsChecklist(res.data);
    } catch {
      setOpsChecklist(null);
    } finally {
      setOpsChecklistLoading(false);
    }
  }

  async function toggleOpsItem(itemId: string, done: boolean) {
    if (!branchId) return;
    setOpsChecklistLoading(true);
    try {
      const res = await api.patch(`/v1/onboarding/operational-checklist/${itemId}`, { done });
      setOpsChecklist(res.data);
    } catch (e: any) {
      alert(e.response?.data?.message ?? "No se pudo actualizar");
    } finally {
      setOpsChecklistLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <h2>Panel piloto</h2>
      <p style={{ color: "var(--t-muted)", marginBottom: 24 }}>
        Verifica que el negocio está listo antes del go-live con clientes reales.
      </p>

      {pilot && (
        <div style={{
          padding: 20, borderRadius: 12, marginBottom: 20,
          background: pilot.readyForPilot ? "var(--t-success-soft)" : "var(--t-warn-soft)",
          border: `1px solid ${pilot.readyForPilot ? "var(--t-success-border)" : "var(--t-warn-border)"}`,
        }}>
          <h3 style={{ margin: "0 0 12px" }}>
            {pilot.readyForPilot ? "✅ Listo para piloto" : "⏳ En preparación"}
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 14 }}>
            <Check ok={pilot.hasResolution} label="Resolución configurada" />
            <Check ok={pilot.hasCatalog} label="Catálogo cargado" />
            <Check ok={pilot.cashOpen} label="Caja abierta" />
            <Check ok={pilot.salesCount > 0} label={`Ventas (${pilot.salesCount})`} />
          </div>
          <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "12px 0 0" }}>
            Modo piloto operativo — DIAN en simulación hasta certificado .p12
          </p>
        </div>
      )}

      {opsSummary && branchId && (
        <div style={{
          padding: 20, borderRadius: 12, marginBottom: 20,
          background: "var(--t-accent-soft)",
          border: "1px solid var(--t-accent-border)",
        }}>
          <h3 style={{ margin: "0 0 12px" }}>Operación hoy — servicio en mesa</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 10, marginBottom: 12 }}>
            <OpsKpi label="Pendientes" value={String(opsSummary.pendingCount)} warn={opsSummary.pendingCount > 0} />
            <OpsKpi label="Vencidas" value={String(opsSummary.overdueCount)} warn={opsSummary.overdueCount > 0} />
            <OpsKpi label="Espera máx." value={`${opsSummary.maxWaitMinutes} min`} warn={opsSummary.maxWaitMinutes >= 10} />
            <OpsKpi label="Servidas hoy" value={String(opsSummary.servedToday)} />
            <OpsKpi label="Promedio" value={`${opsSummary.avgWaitMinutes} min`} />
            <OpsKpi label="SLA" value={`${opsSummary.slaCompliancePct}%`} warn={opsSummary.slaCompliancePct < 100} />
          </div>
          {opsSummary.slaByWaiter.length > 0 && (
            <div style={{ fontSize: 13 }}>
              <strong>Cumplimiento por mesero (meta {opsSummary.slaMinutes} min)</strong>
              {opsSummary.slaByWaiter.map((w: any) => (
                <div key={w.waiterId ?? w.waiterName} style={{
                  display: "flex", justifyContent: "space-between", marginTop: 6,
                  color: w.breached ? "var(--t-danger-fg)" : "var(--t-success-fg)",
                }}>
                  <span>{w.waiterName}</span>
                  <span>{w.compliancePct}% · {w.avgWaitMinutes} min prom.</span>
                </div>
              ))}
            </div>
          )}
          <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "12px 0 0" }}>
            Detalle en pestañas Host y Dashboard
          </p>
        </div>
      )}

      <div style={{ display: "grid", gap: 16 }}>
        <Section title="Checklist habilitación DIAN">
          {checklist ? (
            <>
              <div style={{
                padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
                background: checklist.ready ? "var(--t-success-soft)" : "var(--t-warn-soft)",
                border: `1px solid ${checklist.ready ? "var(--t-success-border)" : "var(--t-warn-border)"}`,
              }}>
                {checklist.ready
                  ? "✅ Requisitos bloqueantes cumplidos — puede pasar a FISCAL_ENV=habilitacion"
                  : `⏳ ${checklist.blockingCount} requisito(s) pendiente(s) — progreso ${checklist.progress}%`}
              </div>
              <div style={{ height: 8, background: "var(--t-border)", borderRadius: 4, marginBottom: 12, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${checklist.progress}%`, background: checklist.ready ? "#16a34a" : "#2563eb" }} />
              </div>
              <div style={{ display: "grid", gap: 6, marginBottom: 12 }}>
                {checklist.items.map((item: any) => (
                  <div key={item.id} style={{
                    fontSize: 13, padding: "8px 10px", borderRadius: 8,
                    background: item.ok ? "var(--t-success-soft)" : item.blocking ? "var(--t-danger-soft)" : "var(--t-card-alt)",
                    border: `1px solid ${item.ok ? "var(--t-success-border)" : item.blocking ? "var(--t-danger-border)" : "var(--t-border)"}`,
                  }}>
                    <div>{item.ok ? "✅" : item.blocking ? "❌" : "⬜"} {item.label}</div>
                    {!item.ok && (
                      <div style={{ fontSize: 11, color: "var(--t-muted)", marginTop: 4 }}>{item.hint}</div>
                    )}
                  </div>
                ))}
              </div>
              {checklist.nextSteps.length > 0 && (
                <div style={{ fontSize: 13 }}>
                  <strong>Próximos pasos</strong>
                  <ol style={{ margin: "8px 0 0", paddingLeft: 20, lineHeight: 1.7 }}>
                    {checklist.nextSteps.map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}
              <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "12px 0 0" }}>
                Guía completa: docs/DIAN-HABILITACION.md
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, color: "var(--t-muted)" }}>
              {branchId ? "Cargando checklist…" : "Selecciona una sucursal para ver el checklist"}
            </p>
          )}
        </Section>

        <Section title="Certificado DIAN">
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
            background: fiscal?.loaded ? "var(--t-success-soft)" : "var(--t-warn-soft)",
            border: `1px solid ${fiscal?.loaded ? "var(--t-success-border)" : "var(--t-warn-border)"}`,
          }}>
            {fiscal?.loaded
              ? "✅ Certificado cargado — listo para habilitación"
              : "⏳ Esperando certificado .p12 — operando en modo simulación"}
          </div>
          {fiscal ? (
            <div style={{ fontSize: 14 }}>
              <Row label="Entorno" value={fiscal.fiscalEnv} />
              <Row label="Certificado" value={fiscal.loaded ? `✅ ${fiscal.subject}` : "❌ No cargado"} />
              {fiscal.validTo && <Row label="Vence" value={new Date(fiscal.validTo).toLocaleDateString("es-CO")} />}
              <Row label="Endpoint" value={fiscal.endpoint} />
              <Row label="Test Set ID" value={fiscal.testSetId ?? "No configurado"} />
            </div>
          ) : (
            <p>Cargando…</p>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button onClick={sendHabilitationTest} disabled={loading || !branchId} style={btnBlue}>
              Enviar set habilitación
            </button>
            <button onClick={retryPending} disabled={loading || !branchId} style={btnGray}>
              Reintentar pendientes
            </button>
          </div>
          {testResult && (
            <pre style={{ fontSize: 11, background: "var(--t-subtle)", padding: 10, borderRadius: 8, marginTop: 8, overflow: "auto" }}>
              {JSON.stringify(testResult, null, 2)}
            </pre>
          )}
        </Section>

        <Section title="Impresión">
          <div style={{
            padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
            background: printAgent?.ok ? "var(--t-success-soft)" : "var(--t-warn-soft)",
            border: `1px solid ${printAgent?.ok ? "var(--t-success-border)" : "var(--t-warn-border)"}`,
          }}>
            {printAgent?.ok
              ? printAgent.dual
                ? `✅ Print Agent · Caja ${printAgent.cash} · Cocina ${printAgent.kitchen}`
                : `✅ Print Agent activo → ${printAgent.cash ?? printAgent.printer ?? "impresora"}`
              : "⏳ Print Agent no detectado (puerto 9101) — se usará HTML al cobrar"}
          </div>
          <p style={{ fontSize: 13, color: "var(--t-muted)", margin: "0 0 12px" }}>
            Dos impresoras: caja (tiquetes) y cocina (comandas). Configure IPs en Configuración o vía env:
          </p>
          <pre style={{ fontSize: 11, background: "var(--t-subtle)", padding: 10, borderRadius: 8, marginBottom: 12, overflow: "auto" }}>
{`PRINTER_IP=192.168.1.100 \\
KITCHEN_PRINTER_IP=192.168.1.101 \\
node apps/print-agent/index.js`}
          </pre>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button
              onClick={async () => {
                openDemoReceipt();
                await markPrintTestDone();
              }}
              style={btnBlue}
            >
              Tiquete demo (HTML)
            </button>
            <button onClick={testAgentPrint} disabled={loading} style={btnBlue}>Test caja</button>
            <button
              onClick={async () => {
                setLoading(true);
                try {
                  const r = await testPrintAgent("kitchen");
                  if (r.ok) await markPrintTestDone();
                  alert(r.ok ? "✅ Test cocina OK" : r.error ?? "Falló");
                  await refreshPrintAgent();
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading}
              style={btnBlue}
            >
              Test cocina
            </button>
            <button onClick={refreshPrintAgent} style={btnGray}>Verificar agente</button>
            <button onClick={testNetworkPrint} disabled={loading} style={btnGray}>Test red (API)</button>
          </div>
          {opsChecklist?.items?.find((i: any) => i.id === "print_test") && (
            <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "10px 0 0" }}>
              {opsChecklist.items.find((i: any) => i.id === "print_test")?.ok
                ? "✅ Impresión marcada en checklist go-live"
                : "Al probar impresión (demo, caja o cocina) se marca automáticamente en el checklist."}
            </p>
          )}
        </Section>

        <Section title="Prueba en piso (tablet mesero)">
          {floorInfo ? (
            <>
              <p style={{ fontSize: 14, color: "var(--t-muted)", margin: "0 0 12px" }}>
                Usa una tablet en el salón con la cuenta mesero. Solo verá <strong>Mesas</strong> y <strong>Comanda</strong>.
              </p>
              <div style={{
                padding: 12,
                borderRadius: 8,
                background: "var(--t-card-alt)",
                border: "1px solid var(--t-border)",
                fontSize: 13,
                lineHeight: 1.7,
                marginBottom: 12,
              }}>
                <div><strong>URL:</strong> <code style={{ fontSize: 12 }}>{floorInfo.kioskUrl}</code></div>
                <div><strong>Login:</strong> {floorInfo.email} / {floorInfo.password}</div>
                <div><strong>PIN salida:</strong> {floorInfo.exitPin}</div>
              </div>
              <ol style={{ margin: "0 0 12px", paddingLeft: 20, fontSize: 13, color: "var(--t-muted)", lineHeight: 1.7 }}>
                <li>Abrir mesa libre → elegir mesero y comensales</li>
                <li>Agregar 1–2 platos → Enviar a cocina</li>
                <li>Ver alerta en cocina/KDS → marcar servida → Cobrar</li>
              </ol>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="button" onClick={() => window.open(waiterKioskUrl(), "_blank")} style={btnBlue}>
                  Abrir modo mesero
                </button>
                <button type="button" onClick={copyFloorCredentials} style={btnGray}>
                  Copiar credenciales
                </button>
                {onOpenTab && (
                  <button type="button" onClick={() => onOpenTab("training")} style={btnGray}>
                    Capacitación meseros →
                  </button>
                )}
              </div>
            </>
          ) : (
            <p style={{ fontSize: 14, color: "var(--t-muted)", margin: 0 }}>Cargando datos del piloto…</p>
          )}
        </Section>

        <Section title="Catálogo piloto">
          <p style={{ fontSize: 14, color: "var(--t-muted)", margin: "0 0 12px" }}>
            Sincroniza el menú oficial del Restaurante de Yall (20 productos, precios Colombia).
          </p>
          <button onClick={syncMenu} disabled={loading} style={btnBlue}>
            Sincronizar menú piloto
          </button>
        </Section>

        <Section title="Checklist go-live operativo">
          {!branchId ? (
            <p style={{ fontSize: 14, color: "var(--t-muted)", margin: 0 }}>
              Selecciona una sucursal para ver el progreso hacia el go-live.
            </p>
          ) : opsChecklist ? (
            <>
              <p style={{ fontSize: 13, color: "var(--t-muted)", margin: "0 0 12px" }}>
                Valida el flujo completo antes de abrir con clientes. Puedes ejecutar la simulación automática o completar cada paso manualmente.
              </p>
              <button
                onClick={runOperationalSimulation}
                disabled={loading || opsChecklistLoading}
                style={{ ...btnBlue, marginBottom: 14, width: "100%" }}
              >
                {loading ? "Ejecutando simulación…" : "▶ Ejecutar simulación piloto"}
              </button>

              {simulationResult?.steps && (
                <div style={{
                  marginBottom: 14,
                  padding: 12,
                  borderRadius: 8,
                  background: "var(--t-card-alt)",
                  border: "1px solid var(--t-border)",
                  fontSize: 13,
                }}>
                  <strong>Última simulación</strong>
                  <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                    {simulationResult.steps.map((s: any, i: number) => (
                      <div key={i} style={{ color: s.ok ? "var(--t-success-fg)" : "var(--t-danger-fg)" }}>
                        {s.ok ? "✅" : "❌"} {s.step}
                        {s.detail ? <span style={{ color: "var(--t-muted)" }}> — {s.detail}</span> : null}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13,
                background: opsChecklist.ready ? "var(--t-success-soft)" : "var(--t-warn-soft)",
                border: `1px solid ${opsChecklist.ready ? "var(--t-success-border)" : "var(--t-warn-border)"}`,
              }}>
                {opsChecklist.ready
                  ? "✅ Listo para operar con clientes reales (sin DIAN)"
                  : `⏳ ${opsChecklist.blockingCount} paso(s) bloqueante(s) — progreso ${opsChecklist.progress}%`}
              </div>
              <div style={{ height: 8, background: "var(--t-border)", borderRadius: 4, overflow: "hidden", marginBottom: 14 }}>
                <div style={{
                  height: "100%",
                  width: `${opsChecklist.progress}%`,
                  background: opsChecklist.ready ? "#16a34a" : "#2563eb",
                }} />
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {opsChecklist.items.map((item: any) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "flex-start",
                      padding: "8px 10px",
                      borderRadius: 8,
                      background: item.ok ? "var(--t-success-soft)" : item.blocking ? "var(--t-orange-soft)" : "var(--t-card-alt)",
                      border: `1px solid ${item.ok ? "var(--t-success-border)" : item.blocking ? "var(--t-orange-border)" : "var(--t-border)"}`,
                      fontSize: 13,
                    }}
                  >
                    <span style={{ flexShrink: 0 }}>{item.ok ? "✅" : item.blocking ? "⬜" : "◻️"}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: item.blocking ? 600 : 500 }}>{item.label}</div>
                      <div style={{ color: "var(--t-muted)", fontSize: 12, marginTop: 2 }}>{item.hint}</div>
                    </div>
                    {item.manual && (
                      <button
                        onClick={() => toggleOpsItem(item.id, !item.ok)}
                        disabled={opsChecklistLoading}
                        style={{
                          ...btnGray,
                          fontSize: 12,
                          padding: "4px 8px",
                          flexShrink: 0,
                        }}
                      >
                        {item.ok ? "Desmarcar" : "Marcar"}
                      </button>
                    )}
                    {!item.ok && item.tab && onOpenTab && (
                      <button
                        onClick={() => onOpenTab(item.tab)}
                        style={{
                          ...btnBlue,
                          fontSize: 12,
                          padding: "4px 8px",
                          flexShrink: 0,
                        }}
                      >
                        Ir
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {opsChecklist.nextSteps.length > 0 && (
                <div style={{ marginTop: 14, fontSize: 13 }}>
                  <strong>Siguiente:</strong>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                    {opsChecklist.nextSteps.map((step: string, i: number) => (
                      <li key={i}>{step}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button onClick={refreshOpsChecklist} disabled={opsChecklistLoading} style={btnGray}>
                  {opsChecklistLoading ? "Actualizando…" : "Actualizar progreso"}
                </button>
              </div>
              <p style={{ fontSize: 12, color: "var(--t-muted)", margin: "12px 0 0" }}>
                Habilitación DIAN pendiente hasta certificado .p12 — ver checklist fiscal arriba.
                {" "}
                <button
                  type="button"
                  onClick={() => onOpenTab?.("training")}
                  style={{ background: "none", border: "none", color: "#2563eb", cursor: "pointer", padding: 0, fontSize: 12 }}
                >
                  Capacitación meseros →
                </button>
              </p>
            </>
          ) : (
            <p style={{ fontSize: 14, color: "var(--t-muted)", margin: 0 }}>Cargando checklist…</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 16 }}>
      <h4 style={{ margin: "0 0 12px" }}>{title}</h4>
      {children}
    </div>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <div>{ok ? "✅" : "⬜"} {label}</div>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
      <span style={{ color: "var(--t-muted)" }}>{label}</span>
      <span style={{ fontWeight: 500, maxWidth: "60%", textAlign: "right", wordBreak: "break-all" }}>{value}</span>
    </div>
  );
}

function OpsKpi({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{
      background: "var(--t-card)",
      borderRadius: 8,
      padding: "10px 12px",
      border: `1px solid ${warn ? "var(--t-danger-border)" : "var(--t-accent-border)"}`,
    }}>
      <div style={{ fontSize: 11, color: "var(--t-muted)" }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: warn ? "var(--t-danger-fg)" : "var(--t-fg)" }}>{value}</div>
    </div>
  );
}

const btnBlue: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer" };
const btnGray: React.CSSProperties = { padding: "8px 14px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", cursor: "pointer" };
