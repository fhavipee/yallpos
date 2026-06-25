export type OperationalCheckItem = {
  id: string;
  label: string;
  ok: boolean;
  hint: string;
  blocking: boolean;
  manual: boolean;
  tab?: string;
};

export type OperationalChecklist = {
  ready: boolean;
  progress: number;
  blockingCount: number;
  items: OperationalCheckItem[];
  nextSteps: string[];
};

type BuildInput = {
  activeProducts: number;
  cashOpen: boolean;
  counterSales: number;
  tableKitchenSent: number;
  tablePaid: number;
  kdsServed: number;
  reservations: number;
  waitersTotal: number;
  waitersWithPhone: number;
  hostPhoneConfigured: boolean;
  cashClosedSessions: number;
  manual: Record<string, boolean>;
};

export function buildOperationalChecklist(input: BuildInput): OperationalChecklist {
  const printOk = input.manual.print_test === true;
  const trainingOk = input.manual.staff_training === true;
  const parallelOk = input.manual.parallel_ops === true;
  const cashCloseOk = input.cashClosedSessions > 0 || input.manual.cash_close === true;

  const items: OperationalCheckItem[] = [
    {
      id: "catalog",
      label: "Menú cargado (≥20 productos activos)",
      ok: input.activeProducts >= 20,
      hint: input.activeProducts >= 20
        ? `${input.activeProducts} productos activos`
        : "Piloto → Sincronizar menú piloto",
      blocking: true,
      manual: false,
      tab: "pilot",
    },
    {
      id: "cash_open",
      label: "Caja abierta",
      ok: input.cashOpen,
      hint: input.cashOpen ? "Sesión de caja activa" : "Dashboard → Abrir caja",
      blocking: true,
      manual: false,
      tab: "dashboard",
    },
    {
      id: "table_kitchen",
      label: "Comanda de mesa enviada a cocina",
      ok: input.tableKitchenSent > 0,
      hint: input.tableKitchenSent > 0
        ? `${input.tableKitchenSent} comanda(s) en cocina`
        : "Mesas → Comanda → Enviar a cocina",
      blocking: true,
      manual: false,
      tab: "order",
    },
    {
      id: "table_paid",
      label: "Cobro de mesa probado",
      ok: input.tablePaid > 0,
      hint: input.tablePaid > 0
        ? `${input.tablePaid} mesa(s) cobrada(s)`
        : "Comanda → Pagar (cierra la mesa)",
      blocking: true,
      manual: false,
      tab: "order",
    },
    {
      id: "kds_served",
      label: "KDS: mesa marcada como servida",
      ok: input.kdsServed > 0,
      hint: input.kdsServed > 0
        ? `${input.kdsServed} ítem(s) servidos`
        : "KDS o Host → Marcar servida",
      blocking: true,
      manual: false,
      tab: "kds",
    },
    {
      id: "reservation",
      label: "Reserva de prueba creada",
      ok: input.reservations > 0,
      hint: input.reservations > 0
        ? `${input.reservations} reserva(s) registrada(s)`
        : "Mesas → + Reserva (con celular para WhatsApp)",
      blocking: false,
      manual: false,
      tab: "tables",
    },
    {
      id: "waiter_phones",
      label: "Meseros con celular (WhatsApp)",
      ok: input.waitersTotal > 0 && input.waitersWithPhone === input.waitersTotal,
      hint: input.waitersTotal === 0
        ? "Sin meseros activos"
        : `${input.waitersWithPhone}/${input.waitersTotal} con celular — Config → Meseros`,
      blocking: false,
      manual: false,
      tab: "settings",
    },
    {
      id: "host_phone",
      label: "Teléfono host / gerente configurado",
      ok: input.hostPhoneConfigured,
      hint: input.hostPhoneConfigured
        ? "Alertas WhatsApp al host habilitadas"
        : "Config → WhatsApp del host",
      blocking: false,
      manual: false,
      tab: "settings",
    },
    {
      id: "counter_sale",
      label: "Venta mostrador de prueba",
      ok: input.counterSales > 0,
      hint: input.counterSales > 0
        ? `${input.counterSales} venta(s) mostrador`
        : "Mostrador → venta rápida y cobro",
      blocking: false,
      manual: false,
      tab: "counter",
    },
    {
      id: "cash_close",
      label: "Cierre de caja probado (Reporte X)",
      ok: cashCloseOk,
      hint: cashCloseOk
        ? "Cierre registrado"
        : "Dashboard → Cerrar caja y revisar Reporte X",
      blocking: true,
      manual: !cashCloseOk && input.cashClosedSessions === 0,
      tab: "dashboard",
    },
    {
      id: "print_test",
      label: "Impresión tiquete / comanda probada",
      ok: printOk,
      hint: printOk
        ? "Confirmado por el equipo"
        : "Piloto → Test caja / Test cocina",
      blocking: true,
      manual: true,
      tab: "pilot",
    },
    {
      id: "staff_training",
      label: "Capacitación meseros (~30 min)",
      ok: trainingOk,
      hint: trainingOk ? "Completada" : "Pestaña Capacitación → practicar y finalizar",
      blocking: false,
      manual: true,
      tab: "training",
    },
    {
      id: "parallel_ops",
      label: "3 días operación paralela (opcional)",
      ok: parallelOk,
      hint: parallelOk ? "Completado" : "Comparar totales con sistema anterior",
      blocking: false,
      manual: true,
    },
  ];

  const blockingItems = items.filter((i) => i.blocking);
  const blockingOk = blockingItems.filter((i) => i.ok).length;
  const blockingCount = blockingItems.length - blockingOk;
  const progress = blockingItems.length
    ? Math.round((blockingOk / blockingItems.length) * 100)
    : 100;

  const nextSteps: string[] = [];
  for (const item of items.filter((i) => i.blocking && !i.ok)) {
    nextSteps.push(item.hint);
    if (nextSteps.length >= 4) break;
  }

  return {
    ready: blockingCount === 0,
    progress,
    blockingCount,
    items,
    nextSteps,
  };
}

export const MANUAL_OPERATIONAL_ITEMS = new Set([
  "print_test",
  "cash_close",
  "staff_training",
  "parallel_ops",
]);
