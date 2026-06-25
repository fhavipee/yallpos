import { useEffect, useState } from "react";
import { api, setBranchId } from "../lib/api";
import { fetchPrinterConfig, persistPrinterConfig, type PrinterConfig } from "../lib/printers";
import { getPrintAgentStatus, testPrintAgent } from "../lib/print";
import { waiterKioskUrl } from "../lib/waiterKiosk";

export default function SettingsPage({ branchId }: { branchId: string }) {
  const [company, setCompany] = useState<any>(null);
  const [fiscal, setFiscal] = useState<any>(null);
  const [printers, setPrinters] = useState<PrinterConfig>({
    cashPrinterIp: "",
    cashPrinterPort: "9100",
    kitchenPrinterIp: "",
    kitchenPrinterPort: "9100",
  });
  const [agentStatus, setAgentStatus] = useState<string>("");
  const [notifications, setNotifications] = useState({
    webhookUrl: "",
    reservationRemindMinutes: "30",
    pickupNotifyAuto: true,
    reservationSoundEnabled: true,
    printSeatingSlipOnReservation: true,
    tableReadySoundEnabled: true,
    tableReadyWarnMinutes: "10",
    tableReadyOverdueSoundEnabled: true,
    tableReadyOverdueWebhookEnabled: true,
    hostPhone: "",
    tableReadyHostWhatsAppEnabled: true,
    tableReadyWaiterWhatsAppEnabled: true,
    tableReadySlaMinutes: "8",
    tableReadySlaWebhookEnabled: true,
  });
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState<"cash" | "kitchen" | null>(null);
  const [waiters, setWaiters] = useState<{ id: string; name: string; phone?: string | null }[]>([]);
  const [savingWaiterId, setSavingWaiterId] = useState<string | null>(null);
  const [kiosk, setKiosk] = useState({ adminPin: "", hasAdminPin: false });

  useEffect(() => {
    setBranchId(branchId);
    api.get("/v1/settings/company").then((r) => {
      setCompany(r.data);
      setFiscal(r.data.fiscalResolutions?.[0] ?? null);
    });
    fetchPrinterConfig(branchId).then(setPrinters);
    api.get("/v1/settings/branch").then((r) => {
      const n = r.data?.notifications ?? {};
      setNotifications({
        webhookUrl: n.webhookUrl ?? "",
        reservationRemindMinutes: String(n.reservationRemindMinutes ?? 30),
        pickupNotifyAuto: n.pickupNotifyAuto !== false,
        reservationSoundEnabled: n.reservationSoundEnabled !== false,
        printSeatingSlipOnReservation: n.printSeatingSlipOnReservation !== false,
        tableReadySoundEnabled: n.tableReadySoundEnabled !== false,
        tableReadyWarnMinutes: String(n.tableReadyWarnMinutes ?? 10),
        tableReadyOverdueSoundEnabled: n.tableReadyOverdueSoundEnabled !== false,
        tableReadyOverdueWebhookEnabled: n.tableReadyOverdueWebhookEnabled !== false,
        hostPhone: n.hostPhone ?? "",
        tableReadyHostWhatsAppEnabled: n.tableReadyHostWhatsAppEnabled !== false,
        tableReadyWaiterWhatsAppEnabled: n.tableReadyWaiterWhatsAppEnabled !== false,
        tableReadySlaMinutes: String(n.tableReadySlaMinutes ?? 8),
        tableReadySlaWebhookEnabled: n.tableReadySlaWebhookEnabled !== false,
      });
      const k = r.data?.kiosk ?? {};
      setKiosk({ adminPin: "", hasAdminPin: Boolean(k.hasAdminPin) });
    }).catch(() => {});
    api.get("/v1/restaurant/waiters").then((r) => setWaiters(r.data)).catch(() => {});
    refreshAgent();
  }, [branchId]);

  async function refreshAgent() {
    const status = await getPrintAgentStatus();
    if (!status?.ok) {
      setAgentStatus("Print Agent no detectado (puerto 9101)");
      return;
    }
    setAgentStatus(
      status.dual
        ? `Activo · Caja ${status.cash} · Cocina ${status.kitchen}`
        : `Activo · ${status.cash ?? status.printer}${status.kitchen && status.kitchen !== status.cash ? ` · Cocina ${status.kitchen}` : ""}`,
    );
  }

  async function saveCompany() {
    await api.patch("/v1/settings/company", {
      razonSocial: company.razonSocial,
      nit: company.nit,
      dv: company.dv,
      email: company.email,
      phone: company.phone,
      address: company.address,
      city: company.city,
    });
    flashSaved();
  }

  async function saveFiscal() {
    if (!fiscal) return;
    await api.patch("/v1/settings/fiscal-resolution", {
      prefix: fiscal.prefix,
      fromNumber: fiscal.fromNumber,
      toNumber: fiscal.toNumber,
      validFrom: fiscal.validFrom?.slice(0, 10),
      validTo: fiscal.validTo?.slice(0, 10),
      technicalKey: fiscal.technicalKey,
    });
    flashSaved();
  }

  async function saveNotifications() {
    await api.patch("/v1/settings/branch", {
      notifications: {
        webhookUrl: notifications.webhookUrl || undefined,
        reservationRemindMinutes: Number(notifications.reservationRemindMinutes) || 30,
        pickupNotifyAuto: notifications.pickupNotifyAuto,
        reservationSoundEnabled: notifications.reservationSoundEnabled,
        printSeatingSlipOnReservation: notifications.printSeatingSlipOnReservation,
        tableReadySoundEnabled: notifications.tableReadySoundEnabled,
        tableReadyWarnMinutes: Number(notifications.tableReadyWarnMinutes) || 10,
        tableReadyOverdueSoundEnabled: notifications.tableReadyOverdueSoundEnabled,
        tableReadyOverdueWebhookEnabled: notifications.tableReadyOverdueWebhookEnabled,
        hostPhone: notifications.hostPhone.trim() || undefined,
        tableReadyHostWhatsAppEnabled: notifications.tableReadyHostWhatsAppEnabled,
        tableReadyWaiterWhatsAppEnabled: notifications.tableReadyWaiterWhatsAppEnabled,
        tableReadySlaMinutes: Number(notifications.tableReadySlaMinutes) || 8,
        tableReadySlaWebhookEnabled: notifications.tableReadySlaWebhookEnabled,
      },
    });
    flashSaved();
  }

  async function saveKioskSettings() {
    if (!kiosk.adminPin.trim() && !kiosk.hasAdminPin) {
      alert("Ingresa un PIN de administrador (4-6 dígitos)");
      return;
    }
    if (kiosk.adminPin.trim()) {
      await api.patch("/v1/settings/branch", {
        kiosk: { adminPin: kiosk.adminPin.trim() },
      });
      setKiosk((k) => ({ adminPin: "", hasAdminPin: true }));
    }
    flashSaved();
  }

  async function saveWaiterPhone(waiterId: string, phone: string) {
    setSavingWaiterId(waiterId);
    try {
      const res = await api.patch(`/v1/restaurant/waiters/${waiterId}`, {
        phone: phone.trim() || undefined,
      });
      setWaiters((list) => list.map((w) => (w.id === waiterId ? res.data : w)));
      flashSaved();
    } finally {
      setSavingWaiterId(null);
    }
  }

  async function savePrinters() {
    await persistPrinterConfig(branchId, printers);
    flashSaved();
    refreshAgent();
  }

  async function testPrinter(target: "cash" | "kitchen") {
    setTesting(target);
    try {
      await persistPrinterConfig(branchId, printers);
      const result = await testPrintAgent(target);
      if (result.ok) {
        alert(`✅ Test ${target === "cash" ? "caja" : "cocina"} enviado (${result.bytes} bytes)`);
      } else {
        alert(result.error ?? "Print Agent no respondió");
      }
      refreshAgent();
    } finally {
      setTesting(null);
    }
  }

  function flashSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!company) return <div>Cargando…</div>;

  return (
    <div style={{ maxWidth: 560 }}>
      <h2>Configuración</h2>
      {saved && <div className="yall-alert-success" style={{ padding: 10, borderRadius: 8, marginBottom: 16 }}>✅ Guardado</div>}

      <section style={sectionStyle}>
        <h3>Impresoras térmicas</h3>
        <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
          Caja: tiquetes y reporte X. Cocina: comandas. Inicie el Print Agent con ambas IPs o configúrelas aquí.
        </p>
        <div style={{ fontSize: 13, padding: 10, borderRadius: 8, background: "var(--t-card-alt)", marginBottom: 12 }}>
          {agentStatus || "Verificando agente…"}
        </div>
        <Field label="IP impresora caja" value={printers.cashPrinterIp} onChange={(v) => setPrinters({ ...printers, cashPrinterIp: v })} placeholder="192.168.1.100" />
        <Field label="Puerto caja" value={printers.cashPrinterPort} onChange={(v) => setPrinters({ ...printers, cashPrinterPort: v })} />
        <Field label="IP impresora cocina" value={printers.kitchenPrinterIp} onChange={(v) => setPrinters({ ...printers, kitchenPrinterIp: v })} placeholder="192.168.1.101" />
        <Field label="Puerto cocina" value={printers.kitchenPrinterPort} onChange={(v) => setPrinters({ ...printers, kitchenPrinterPort: v })} />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button onClick={savePrinters} style={btnSave}>Guardar impresoras</button>
          <button onClick={() => testPrinter("cash")} disabled={testing !== null} style={btnOutline}>
            {testing === "cash" ? "…" : "Test caja"}
          </button>
          <button onClick={() => testPrinter("kitchen")} disabled={testing !== null} style={btnOutline}>
            {testing === "kitchen" ? "…" : "Test cocina"}
          </button>
        </div>
        <pre style={{ fontSize: 11, background: "var(--t-subtle)", padding: 10, borderRadius: 8, marginTop: 12, overflow: "auto" }}>
{`cd apps/print-agent
PRINTER_IP=192.168.1.100 \\
KITCHEN_PRINTER_IP=192.168.1.101 \\
node index.js`}
        </pre>
      </section>

      <section style={sectionStyle}>
        <h3>Notificaciones de reservas</h3>
        <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
          Webhook opcional al crear reservas y aviso automático cuando un pedido de mostrador esté listo en cocina.
        </p>
        <Field
          label="Webhook URL (opcional)"
          value={notifications.webhookUrl}
          onChange={(v) => setNotifications({ ...notifications, webhookUrl: v })}
          placeholder="https://hooks.example.com/reservas"
        />
        <Field
          label="Recordatorio reservas (minutos antes)"
          value={notifications.reservationRemindMinutes}
          onChange={(v) => setNotifications({ ...notifications, reservationRemindMinutes: v })}
          placeholder="30"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.pickupNotifyAuto}
            onChange={(e) => setNotifications({ ...notifications, pickupNotifyAuto: e.target.checked })}
          />
          Aviso automático pedido listo (webhook + links WhatsApp/SMS en cocina)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.reservationSoundEnabled}
            onChange={(e) => setNotifications({ ...notifications, reservationSoundEnabled: e.target.checked })}
          />
          Alerta sonora en Mesas cuando una reserva está próxima
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.printSeatingSlipOnReservation}
            onChange={(e) => setNotifications({ ...notifications, printSeatingSlipOnReservation: e.target.checked })}
          />
          Imprimir comanda de bienvenida al sentar una reserva (impresora cocina)
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadySoundEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadySoundEnabled: e.target.checked })}
          />
          Alerta sonora al mesero cuando cocina marca mesa lista
        </label>
        <Field
          label="Alerta si mesa lista espera más de (minutos)"
          value={notifications.tableReadyWarnMinutes}
          onChange={(v) => setNotifications({ ...notifications, tableReadyWarnMinutes: v })}
          placeholder="10"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadyOverdueSoundEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadyOverdueSoundEnabled: e.target.checked })}
          />
          Alerta sonora repetida cuando una mesa supera ese tiempo sin servir
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadyOverdueWebhookEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadyOverdueWebhookEnabled: e.target.checked })}
          />
          Webhook cuando una mesa supera el tiempo sin servir (usa la URL de arriba, evento table.ready_overdue)
        </label>
        <Field
          label="WhatsApp del host / gerente (solo números, ej. 3001234567)"
          value={notifications.hostPhone}
          onChange={(v) => setNotifications({ ...notifications, hostPhone: v })}
          placeholder="3001234567"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadyHostWhatsAppEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadyHostWhatsAppEnabled: e.target.checked })}
          />
          Botón WhatsApp al host cuando una mesa demora en servirse
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadyWaiterWhatsAppEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadyWaiterWhatsAppEnabled: e.target.checked })}
          />
          Botón WhatsApp al mesero cuando la mesa queda lista o demora en servirse
        </label>
        <Field
          label="Meta SLA — tiempo máximo lista → servida (minutos)"
          value={notifications.tableReadySlaMinutes}
          onChange={(v) => setNotifications({ ...notifications, tableReadySlaMinutes: v })}
          placeholder="8"
        />
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginBottom: 12 }}>
          <input
            type="checkbox"
            checked={notifications.tableReadySlaWebhookEnabled}
            onChange={(e) => setNotifications({ ...notifications, tableReadySlaWebhookEnabled: e.target.checked })}
          />
          Webhook si el promedio semanal supera la meta SLA (evento table.sla_weekly_breach)
        </label>
        <button onClick={saveNotifications} style={btnSave}>Guardar notificaciones</button>
      </section>

      <section style={sectionStyle}>
        <h3>Teléfonos de meseros (WhatsApp)</h3>
        <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
          Número móvil de cada mesero para alertas cuando su mesa supera el tiempo sin servir.
        </p>
        {waiters.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--t-muted)" }}>No hay meseros activos en esta sucursal.</p>
        ) : (
          waiters.map((waiter) => (
            <div key={waiter.id} style={{ display: "flex", gap: 8, alignItems: "end", marginBottom: 10 }}>
              <label style={{ flex: 1, display: "grid", gap: 4, fontSize: 14 }}>
                {waiter.name}
                <input
                  value={waiter.phone ?? ""}
                  placeholder="3001234567"
                  onChange={(e) => {
                    const phone = e.target.value;
                    setWaiters((list) => list.map((w) => (w.id === waiter.id ? { ...w, phone } : w)));
                  }}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-input-bg)", color: "var(--t-input-fg)" }}
                />
              </label>
              <button
                onClick={() => saveWaiterPhone(waiter.id, waiter.phone ?? "")}
                disabled={savingWaiterId === waiter.id}
                style={btnOutline}
              >
                {savingWaiterId === waiter.id ? "…" : "Guardar"}
              </button>
            </div>
          ))
        )}
      </section>

      <section style={sectionStyle}>
        <h3>Modo mesero (quiosco)</h3>
        <p style={{ fontSize: 13, color: "var(--t-muted)", marginTop: 0 }}>
          Interfaz simplificada para tablet: solo <strong>Mesas</strong> y <strong>Comanda</strong>.
          Ideal para meseros en salón.
        </p>
        <Field
          label="PIN de administrador / gerente"
          value={kiosk.adminPin}
          onChange={(v) => setKiosk({ ...kiosk, adminPin: v.replace(/\D/g, "").slice(0, 6) })}
          placeholder={kiosk.hasAdminPin ? "•••• (configurado — ingresa uno nuevo para cambiar)" : "2025"}
        />
        <p style={{ fontSize: 12, color: "var(--t-muted)", marginTop: -8 }}>
          Protege salir del modo mesero y cerrar sesión en el quiosco. Los meseros tienen su propio PIN en Admin → Personal o Usuarios.
        </p>
        <div style={{ fontSize: 13, marginBottom: 12, wordBreak: "break-all" }}>
          <strong>URL tablet:</strong>{" "}
          <a href={waiterKioskUrl()} target="_blank" rel="noreferrer" style={{ color: "var(--t-link)" }}>
            {waiterKioskUrl()}
          </a>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(waiterKioskUrl());
              alert("URL copiada");
            }}
            style={btnOutline}
          >
            Copiar URL
          </button>
          <button type="button" onClick={() => window.open(waiterKioskUrl(), "_blank")} style={btnOutline}>
            Abrir modo mesero
          </button>
          <button onClick={saveKioskSettings} style={btnSave}>Guardar PIN</button>
        </div>
      </section>

      <section style={sectionStyle}>
        <h3>Empresa</h3>
        <Field label="Razón social" value={company.razonSocial ?? ""} onChange={(v) => setCompany({ ...company, razonSocial: v })} />
        <Field label="NIT" value={company.nit ?? ""} onChange={(v) => setCompany({ ...company, nit: v })} />
        <Field label="DV" value={company.dv ?? ""} onChange={(v) => setCompany({ ...company, dv: v })} />
        <Field label="Email facturación" value={company.email ?? ""} onChange={(v) => setCompany({ ...company, email: v })} />
        <Field label="Teléfono" value={company.phone ?? ""} onChange={(v) => setCompany({ ...company, phone: v })} />
        <Field label="Dirección" value={company.address ?? ""} onChange={(v) => setCompany({ ...company, address: v })} />
        <Field label="Ciudad" value={company.city ?? ""} onChange={(v) => setCompany({ ...company, city: v })} />
        <button onClick={saveCompany} style={btnSave}>Guardar empresa</button>
      </section>

      {fiscal && (
        <section style={sectionStyle}>
          <h3>Resolución DE POS</h3>
          <p style={{ fontSize: 13, color: "var(--t-muted)" }}>Actualiza aquí cuando llegue la resolución DIAN real.</p>
          <Field label="Prefijo" value={fiscal.prefix} onChange={(v) => setFiscal({ ...fiscal, prefix: v })} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <Field label="Desde" value={String(fiscal.fromNumber)} onChange={(v) => setFiscal({ ...fiscal, fromNumber: Number(v) })} />
            <Field label="Hasta" value={String(fiscal.toNumber)} onChange={(v) => setFiscal({ ...fiscal, toNumber: Number(v) })} />
          </div>
          <Field label="Clave técnica" value={fiscal.technicalKey ?? ""} onChange={(v) => setFiscal({ ...fiscal, technicalKey: v })} />
          <button onClick={saveFiscal} style={btnSave}>Guardar resolución</button>
        </section>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: "grid", gap: 4, fontSize: 14, marginBottom: 10 }}>
      {label}
      <input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-input-bg)", color: "var(--t-input-fg)" }} />
    </label>
  );
}

const sectionStyle: React.CSSProperties = { background: "var(--t-card)", border: "1px solid var(--t-border)", borderRadius: 12, padding: 20, marginBottom: 16 };
const btnSave: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "none", background: "var(--t-primary)", color: "var(--t-primary-fg)", cursor: "pointer", marginTop: 8 };
const btnOutline: React.CSSProperties = { padding: "10px 16px", borderRadius: 8, border: "1px solid var(--t-border-strong)", background: "var(--t-card)", color: "var(--t-fg)", cursor: "pointer", marginTop: 8 };
