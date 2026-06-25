import { useState } from "react";
import { api } from "../../../lib/api";
import { fetchPrinterConfig, persistPrinterConfig, type PrinterConfig } from "../../../lib/printers";
import { getPrintAgentStatus, testPrintAgent } from "../../../lib/print";
import { waiterKioskUrl } from "../../../lib/waiterKiosk";
import { useAdmin } from "../AdminContext";
import { useAdminAction } from "../hooks/useAdminAction";
import { useAdminResource } from "../hooks/useAdminResource";
import {
  AdminPageHeader,
  AdminSection,
  AdminViewGate,
  CheckboxField,
  Field,
  ReloadButton,
  adminStyles,
} from "../components/AdminUi";

type Notifications = {
  webhookUrl: string;
  reservationRemindMinutes: string;
  pickupNotifyAuto: boolean;
  reservationSoundEnabled: boolean;
  printSeatingSlipOnReservation: boolean;
  tableReadySoundEnabled: boolean;
  tableReadyWarnMinutes: string;
  tableReadyOverdueSoundEnabled: boolean;
  tableReadyOverdueWebhookEnabled: boolean;
  hostPhone: string;
  tableReadyHostWhatsAppEnabled: boolean;
  tableReadyWaiterWhatsAppEnabled: boolean;
  tableReadySlaMinutes: string;
  tableReadySlaWebhookEnabled: boolean;
};

const defaultNotifications = (): Notifications => ({
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

export default function AdminOperationsView() {
  const { branchId, toast } = useAdmin();
  const runAction = useAdminAction();
  const [printers, setPrinters] = useState<PrinterConfig>({
    cashPrinterIp: "",
    cashPrinterPort: "9100",
    kitchenPrinterIp: "",
    kitchenPrinterPort: "9100",
  });
  const [notifications, setNotifications] = useState<Notifications>(defaultNotifications());
  const [kiosk, setKiosk] = useState({ waiterExitPin: "2025" });
  const [agentStatus, setAgentStatus] = useState("");
  const [testing, setTesting] = useState<"cash" | "kitchen" | null>(null);

  const { loading, error, reload } = useAdminResource(async () => {
    const [branchRes, printerCfg] = await Promise.all([
      api.get("/v1/settings/branch"),
      fetchPrinterConfig(branchId),
    ]);
    setPrinters(printerCfg);
    const n = branchRes.data?.notifications ?? {};
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
    const k = branchRes.data?.kiosk ?? {};
    setKiosk({ waiterExitPin: k.waiterExitPin ?? "2025" });
    const status = await getPrintAgentStatus();
    setAgentStatus(
      status?.ok
        ? status.dual
          ? `Print Agent activo · Caja ${status.cash} · Cocina ${status.kitchen}`
          : `Print Agent activo · ${status.cash ?? status.printer}`
        : "Print Agent no detectado (puerto 9101 en PC de caja)",
    );
    return true;
  }, [branchId]);

  async function savePrinters() {
    await runAction(async () => {
      await persistPrinterConfig(branchId, printers);
    }, "Impresoras guardadas");
  }

  async function testPrinter(target: "cash" | "kitchen") {
    setTesting(target);
    try {
      await persistPrinterConfig(branchId, printers);
      const result = await testPrintAgent(target);
      toast(result.ok ? `Test ${target} enviado` : (result.error ?? "Error de impresión"), result.ok ? "ok" : "err");
    } finally {
      setTesting(null);
    }
  }

  async function saveNotifications() {
    await runAction(async () => {
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
    }, "Notificaciones guardadas");
  }

  async function saveKiosk() {
    await runAction(async () => {
      await api.patch("/v1/settings/branch", { kiosk: { waiterExitPin: kiosk.waiterExitPin.trim() || "2025" } });
    }, "PIN modo mesero guardado");
  }

  return (
    <AdminViewGate loading={loading} error={error} onRetry={reload}>
      <AdminPageHeader
        title="Operaciones"
        desc="Impresoras, alertas de reservas/mesas y modo mesero para tablets."
        actions={<ReloadButton onClick={reload} />}
      />

      <AdminSection title="Impresoras térmicas" desc={agentStatus}>
        <div style={adminStyles.grid2}>
          <Field label="IP impresora caja" hint="Tiquetes cliente y reporte X">
            <input style={adminStyles.input} value={printers.cashPrinterIp} onChange={(e) => setPrinters({ ...printers, cashPrinterIp: e.target.value })} />
          </Field>
          <Field label="Puerto caja"><input style={adminStyles.input} value={printers.cashPrinterPort} onChange={(e) => setPrinters({ ...printers, cashPrinterPort: e.target.value })} /></Field>
          <Field label="IP impresora cocina" hint="Comandas KDS">
            <input style={adminStyles.input} value={printers.kitchenPrinterIp} onChange={(e) => setPrinters({ ...printers, kitchenPrinterIp: e.target.value })} />
          </Field>
          <Field label="Puerto cocina"><input style={adminStyles.input} value={printers.kitchenPrinterPort} onChange={(e) => setPrinters({ ...printers, kitchenPrinterPort: e.target.value })} /></Field>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <button type="button" style={adminStyles.btnPrimary} onClick={savePrinters}>Guardar impresoras</button>
          <button type="button" style={adminStyles.btnSecondary} disabled={testing !== null} onClick={() => testPrinter("cash")}>Test caja</button>
          <button type="button" style={adminStyles.btnSecondary} disabled={testing !== null} onClick={() => testPrinter("kitchen")}>Test cocina</button>
        </div>
      </AdminSection>

      <AdminSection title="Notificaciones y alertas">
        <Field label="Webhook URL" hint="Eventos: reservation.*, table.ready_overdue, table.sla_weekly_breach">
          <input style={adminStyles.input} value={notifications.webhookUrl} onChange={(e) => setNotifications({ ...notifications, webhookUrl: e.target.value })} placeholder="https://…" />
        </Field>
        <div style={adminStyles.grid2}>
          <Field label="Recordatorio reservas (min antes)">
            <input style={adminStyles.input} value={notifications.reservationRemindMinutes} onChange={(e) => setNotifications({ ...notifications, reservationRemindMinutes: e.target.value })} />
          </Field>
          <Field label="Alerta mesa lista sin servir (min)">
            <input style={adminStyles.input} value={notifications.tableReadyWarnMinutes} onChange={(e) => setNotifications({ ...notifications, tableReadyWarnMinutes: e.target.value })} />
          </Field>
          <Field label="Meta SLA lista → servida (min)">
            <input style={adminStyles.input} value={notifications.tableReadySlaMinutes} onChange={(e) => setNotifications({ ...notifications, tableReadySlaMinutes: e.target.value })} />
          </Field>
          <Field label="WhatsApp host / gerente">
            <input style={adminStyles.input} value={notifications.hostPhone} onChange={(e) => setNotifications({ ...notifications, hostPhone: e.target.value })} placeholder="3001234567" />
          </Field>
        </div>
        <CheckboxField label="Aviso automático pedido listo (mostrador)" checked={notifications.pickupNotifyAuto} onChange={(v) => setNotifications({ ...notifications, pickupNotifyAuto: v })} />
        <CheckboxField label="Sonido reservas próximas en Mesas" checked={notifications.reservationSoundEnabled} onChange={(v) => setNotifications({ ...notifications, reservationSoundEnabled: v })} />
        <CheckboxField label="Sonido mesa lista para mesero" checked={notifications.tableReadySoundEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadySoundEnabled: v })} />
        <CheckboxField label="Sonido mesa demorada sin servir" checked={notifications.tableReadyOverdueSoundEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadyOverdueSoundEnabled: v })} />
        <CheckboxField label="Imprimir pase en reserva confirmada" checked={notifications.printSeatingSlipOnReservation} onChange={(v) => setNotifications({ ...notifications, printSeatingSlipOnReservation: v })} />
        <CheckboxField label="Webhook mesa demorada sin servir" checked={notifications.tableReadyOverdueWebhookEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadyOverdueWebhookEnabled: v })} />
        <CheckboxField label="Webhook incumplimiento SLA semanal" checked={notifications.tableReadySlaWebhookEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadySlaWebhookEnabled: v })} />
        <CheckboxField label="WhatsApp al host / gerente" checked={notifications.tableReadyHostWhatsAppEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadyHostWhatsAppEnabled: v })} />
        <CheckboxField label="WhatsApp al mesero (mesa lista / demora)" checked={notifications.tableReadyWaiterWhatsAppEnabled} onChange={(v) => setNotifications({ ...notifications, tableReadyWaiterWhatsAppEnabled: v })} />
        <button type="button" style={adminStyles.btnPrimary} onClick={saveNotifications}>Guardar notificaciones</button>
      </AdminSection>

      <AdminSection title="Modo mesero (quiosco tablet)">
        <Field label="PIN para salir del modo mesero">
          <input style={adminStyles.input} value={kiosk.waiterExitPin} onChange={(e) => setKiosk({ waiterExitPin: e.target.value })} />
        </Field>
        <Field label="URL para tablets">
          <input style={adminStyles.input} readOnly value={waiterKioskUrl()} />
        </Field>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" style={adminStyles.btnSecondary} onClick={() => { navigator.clipboard.writeText(waiterKioskUrl()); toast("URL copiada"); }}>Copiar URL</button>
          <button type="button" style={adminStyles.btnSecondary} onClick={() => window.open(waiterKioskUrl(), "_blank")}>Abrir modo mesero</button>
          <button type="button" style={adminStyles.btnPrimary} onClick={saveKiosk}>Guardar PIN</button>
        </div>
      </AdminSection>
    </AdminViewGate>
  );
}
