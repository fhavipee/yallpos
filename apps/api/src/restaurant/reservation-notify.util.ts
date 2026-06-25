const BOGOTA_TZ = "America/Bogota";

export type ReservationWhatsAppKind = "confirm" | "reminder" | "seated" | "cancelled";

type ReservationMessageInput = {
  customerPhone?: string | null;
  customerName: string;
  guestsCount: number;
  reservedFor: Date;
  branchName: string;
  tableName?: string | null;
  areaName?: string | null;
  notes?: string | null;
};

function normalizeCoPhone(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  if (digits.length === 12 && digits.startsWith("57")) return digits;
  if (digits.length >= 10) return digits;
  return null;
}

function firstName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return "cliente";
  return trimmed.split(/\s+/)[0];
}

function formatReservationWhen(reservedFor: Date) {
  const dateLine = reservedFor.toLocaleDateString("es-CO", {
    timeZone: BOGOTA_TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const timeLine = reservedFor.toLocaleTimeString("es-CO", {
    timeZone: BOGOTA_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const dateFormatted = dateLine.charAt(0).toUpperCase() + dateLine.slice(1);
  return { dateLine: dateFormatted, timeLine };
}

function formatTableLine(areaName?: string | null, tableName?: string | null): string {
  if (tableName && areaName) return `${areaName} · Mesa ${tableName}`;
  if (tableName) return `Mesa ${tableName}`;
  return "Asignamos mesa al llegar";
}

function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function buildReservationMessageText(kind: ReservationWhatsAppKind, input: ReservationMessageInput): string {
  const name = firstName(input.customerName);
  const { dateLine, timeLine } = formatReservationWhen(input.reservedFor);
  const tableLine = formatTableLine(input.areaName, input.tableName);
  const guests = `${input.guestsCount} persona${input.guestsCount === 1 ? "" : "s"}`;
  const notesBlock = input.notes?.trim()
    ? `\n📝 *Nota:* ${input.notes.trim()}\n`
    : "";

  switch (kind) {
    case "confirm":
      return (
        `🍽️ *Confirmación de reserva*\n\n` +
        `Hola *${name}*, te confirmamos tu reserva en *${input.branchName}*.\n\n` +
        `📅 *Fecha:* ${dateLine}\n` +
        `🕐 *Hora:* ${timeLine}\n` +
        `👥 *Personas:* ${guests}\n` +
        `📍 *Mesa:* ${tableLine}` +
        `${notesBlock}\n` +
        `Si necesitas cambiar algo, responde este mensaje.\n\n` +
        `— Restaurante de Yall`
      );
    case "reminder":
      return (
        `⏰ *Recordatorio de reserva*\n\n` +
        `Hola *${name}*, tu reserva en *${input.branchName}* es pronto.\n\n` +
        `🕐 *Hora:* ${timeLine}\n` +
        `👥 *Personas:* ${guests}\n` +
        `📍 *Mesa:* ${tableLine}` +
        `${notesBlock}\n` +
        `Te esperamos. ¡Gracias!\n\n` +
        `— Restaurante de Yall`
      );
    case "seated":
      return (
        `✅ *Tu mesa está lista*\n\n` +
        `Hola *${name}*, ya puedes pasar a *${input.branchName}*.\n\n` +
        `📍 *${tableLine}*\n` +
        `👥 Reserva para ${guests}\n` +
        `${notesBlock}\n` +
        `¡Bienvenido!\n\n` +
        `— Restaurante de Yall`
      );
    case "cancelled":
      return (
        `❌ *Reserva cancelada*\n\n` +
        `Hola *${name}*, tu reserva en *${input.branchName}* fue cancelada.\n\n` +
        `📅 ${dateLine}\n` +
        `🕐 ${timeLine}\n` +
        `👥 ${guests}\n\n` +
        `Si deseas reagendar, responde este mensaje.\n\n` +
        `— Restaurante de Yall`
      );
    default:
      return "";
  }
}

function buildReservationMessage(kind: ReservationWhatsAppKind, input: ReservationMessageInput): string | null {
  const phone = normalizeCoPhone(input.customerPhone);
  if (!phone) return null;
  const text = buildReservationMessageText(kind, input);
  if (!text) return null;
  return buildWhatsAppUrl(phone, text);
}

export function buildReservationWhatsAppMessageText(
  input: ReservationMessageInput,
  kind: ReservationWhatsAppKind = "confirm",
): string {
  return buildReservationMessageText(kind, input);
}

export function buildReservationWhatsAppLink(
  input: ReservationMessageInput,
  kind: ReservationWhatsAppKind = "confirm",
): string | null {
  return buildReservationMessage(kind, input);
}

export function buildReservationWebhookPayload(
  type: "reservation.created" | "reservation.reminder" | "reservation.seated" | "reservation.cancelled",
  branch: { id: string; name: string },
  reservation: Record<string, unknown>,
  whatsappLink?: string | null,
) {
  return {
    type,
    sentAt: new Date().toISOString(),
    branch,
    reservation,
    whatsappLink: whatsappLink ?? null,
  };
}

export function buildPickupReadyMessage(input: {
  customerName?: string | null;
  branchName: string;
  itemsSummary: string;
  invoiceNumber?: string | null;
  pickupCode?: string | null;
}): string {
  const name = firstName(input.customerName?.trim() || "cliente");
  const ref = input.pickupCode
    ? `#${input.pickupCode}`
    : input.invoiceNumber
      ? input.invoiceNumber
      : null;
  const refLine = ref ? `🧾 *Pedido:* ${ref}\n` : "";
  const itemsLine = input.itemsSummary?.trim()
    ? `🍽️ ${input.itemsSummary.trim()}\n`
    : "";

  return (
    `🎉 *Tu pedido está listo*\n\n` +
    `Hola *${name}*,\n\n` +
    `Ya puedes recoger tu pedido en *${input.branchName}*.\n\n` +
    `${refLine}` +
    `${itemsLine}\n` +
    `Te esperamos en mostrador.\n\n` +
    `— Restaurante de Yall`
  );
}

export function buildPickupReadyWhatsAppLink(input: {
  pickupPhone?: string | null;
  customerName?: string | null;
  branchName: string;
  itemsSummary: string;
  invoiceNumber?: string | null;
  pickupCode?: string | null;
}): string | null {
  const phone = normalizeCoPhone(input.pickupPhone);
  if (!phone) return null;
  return buildWhatsAppUrl(phone, buildPickupReadyMessage(input));
}

export function buildPickupReadySmsLink(input: {
  pickupPhone?: string | null;
  customerName?: string | null;
  branchName: string;
  itemsSummary: string;
  invoiceNumber?: string | null;
  pickupCode?: string | null;
}): string | null {
  const phone = normalizeCoPhone(input.pickupPhone);
  if (!phone) return null;
  const text = buildPickupReadyMessage(input);
  return `sms:+${phone}?body=${encodeURIComponent(text)}`;
}

export function buildOrderReadyWebhookPayload(
  branch: { id: string; name: string },
  invoice: Record<string, unknown>,
  links: { whatsappLink?: string | null; smsLink?: string | null },
) {
  return {
    type: "order.ready_for_pickup",
    sentAt: new Date().toISOString(),
    branch,
    invoice,
    whatsappLink: links.whatsappLink ?? null,
    smsLink: links.smsLink ?? null,
  };
}

export function buildTableOverdueWebhookPayload(
  branch: { id: string; name: string },
  input: {
    invoiceId: string;
    tableSessionId?: string | null;
    tableId?: string | null;
    tableLabel: string;
    waiterId?: string | null;
    waiterName?: string | null;
    waitingMinutes: number;
    warnAfterMinutes: number;
    readyAt: Date;
    itemsSummary?: string;
    total?: unknown;
  },
) {
  return {
    type: "table.ready_overdue",
    sentAt: new Date().toISOString(),
    branch,
    table: {
      invoiceId: input.invoiceId,
      tableSessionId: input.tableSessionId ?? null,
      tableId: input.tableId ?? null,
      label: input.tableLabel,
      waiterId: input.waiterId ?? null,
      waiterName: input.waiterName ?? null,
      waitingMinutes: input.waitingMinutes,
      warnAfterMinutes: input.warnAfterMinutes,
      readyAt: input.readyAt.toISOString(),
      itemsSummary: input.itemsSummary ?? null,
      total: input.total ?? null,
    },
  };
}

export function buildTableOverdueHostWhatsAppLink(input: {
  hostPhone?: string | null;
  branchName: string;
  tableLabel: string;
  waiterName?: string | null;
  waitingMinutes: number;
  warnAfterMinutes: number;
  itemsSummary?: string | null;
}): string | null {
  const phone = normalizeCoPhone(input.hostPhone);
  if (!phone) return null;

  const waiterLine = input.waiterName ? `👤 *Mesero:* ${input.waiterName}\n` : "";
  const itemsLine = input.itemsSummary?.trim() ? `🍽️ ${input.itemsSummary.trim()}\n` : "";
  const text =
    `⚠️ *Mesa demorada en servir*\n\n` +
    `*${input.branchName}*\n` +
    `📍 ${input.tableLabel}\n` +
    `${waiterLine}` +
    `⏱️ *Espera:* ${input.waitingMinutes} min (meta ${input.warnAfterMinutes} min)\n` +
    `${itemsLine}\n` +
    `Por favor coordina servicio.\n\n` +
    `— YallPos`;

  return buildWhatsAppUrl(phone, text);
}

export function buildTableOverdueWaiterWhatsAppLink(input: {
  waiterPhone?: string | null;
  branchName: string;
  tableLabel: string;
  waitingMinutes: number;
  warnAfterMinutes: number;
  itemsSummary?: string | null;
}): string | null {
  const phone = normalizeCoPhone(input.waiterPhone);
  if (!phone) return null;

  const itemsLine = input.itemsSummary?.trim() ? `🍽️ ${input.itemsSummary.trim()}\n` : "";
  const text =
    `⚠️ *Mesa lista — demora en servir*\n\n` +
    `*${input.branchName}*\n` +
    `📍 ${input.tableLabel}\n` +
    `⏱️ *Espera:* ${input.waitingMinutes} min (meta ${input.warnAfterMinutes} min)\n` +
    `${itemsLine}\n` +
    `Por favor recoge y sirve.\n\n` +
    `— YallPos`;

  return buildWhatsAppUrl(phone, text);
}

export function buildTableReadyWaiterWhatsAppLink(input: {
  waiterPhone?: string | null;
  branchName: string;
  tableLabel: string;
  itemsSummary?: string | null;
}): string | null {
  const phone = normalizeCoPhone(input.waiterPhone);
  if (!phone) return null;

  const itemsLine = input.itemsSummary?.trim() ? `🍽️ ${input.itemsSummary.trim()}\n` : "";
  const text =
    `🟢 *Mesa lista en cocina*\n\n` +
    `*${input.branchName}*\n` +
    `📍 ${input.tableLabel}\n` +
    `${itemsLine}\n` +
    `Recoge y sirve cuando puedas.\n\n` +
    `— YallPos`;

  return buildWhatsAppUrl(phone, text);
}

export function buildTableSlaWebhookPayload(
  branch: { id: string; name: string },
  input: {
    weekStart: string;
    weekEnd: string;
    slaMinutes: number;
    avgWaitMinutes: number;
    servedCount: number;
    withinSlaCount: number;
    compliancePct: number;
  },
) {
  return {
    type: "table.sla_weekly_breach",
    sentAt: new Date().toISOString(),
    branch,
    sla: {
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      targetMinutes: input.slaMinutes,
      avgWaitMinutes: input.avgWaitMinutes,
      servedCount: input.servedCount,
      withinSlaCount: input.withinSlaCount,
      compliancePct: input.compliancePct,
    },
  };
}

export type ServiceShift = "almuerzo" | "cena" | "otro";

export function getServiceShift(date: Date): ServiceShift {
  const hour = date.getHours();
  if (hour >= 11 && hour < 15) return "almuerzo";
  if (hour >= 18 && hour < 23) return "cena";
  return "otro";
}

export const SERVICE_SHIFT_LABELS: Record<ServiceShift, string> = {
  almuerzo: "Almuerzo (11:00–14:59)",
  cena: "Cena (18:00–22:59)",
  otro: "Otro turno",
};

export function getWeekStartMonday(reference = new Date()): Date {
  const day = new Date(reference);
  day.setHours(0, 0, 0, 0);
  const weekday = day.getDay();
  const diff = weekday === 0 ? -6 : 1 - weekday;
  day.setDate(day.getDate() + diff);
  return day;
}
