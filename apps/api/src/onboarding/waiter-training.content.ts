export type WaiterTrainingStep = {
  id: string;
  title: string;
  durationMin: number;
  summary: string;
  bullets: string[];
  tab?: string;
  optional?: boolean;
};

export const WAITER_TRAINING_STEPS: WaiterTrainingStep[] = [
  {
    id: "kiosk-login",
    title: "Modo mesero (tablet)",
    durationMin: 4,
    summary: "Inicia sesión en la tablet con la cuenta mesero — solo Mesas y Comanda.",
    bullets: [
      "URL: /?view=waiter (se abre solo al login del mesero)",
      "Credenciales: mesero@restaurantedeyall.co / mesero2025",
      "PIN de salida (gerente): 2025 — configurable en Config",
      "Prueba: abrir mesa → agregar plato → enviar a cocina",
    ],
    tab: "pilot",
  },
  {
    id: "open-table",
    title: "Abrir mesa",
    durationMin: 5,
    summary: "Selecciona mesero, comensales y abre la mesa en el mapa.",
    bullets: [
      "Pestaña Mesas → elige mesa libre (verde)",
      "Indica número de comensales y mesero responsable",
      "Al abrir, la comanda se abre automáticamente",
    ],
    tab: "tables",
  },
  {
    id: "take-order",
    title: "Tomar pedido",
    durationMin: 5,
    summary: "Agrega platos desde categorías o busca por nombre / código.",
    bullets: [
      "Comanda → toca categoría y plato",
      "Puedes escanear código de barras (lector USB)",
      "Revisa total y cantidad antes de enviar a cocina",
    ],
    tab: "order",
  },
  {
    id: "line-notes",
    title: "Notas por producto",
    durationMin: 3,
    summary: "Anota modificaciones antes de agregar el ítem.",
    bullets: [
      "Al agregar, escribe nota: «sin cebolla», «término medio», etc.",
      "Las notas van impresas en cocina y en el KDS",
    ],
    tab: "order",
  },
  {
    id: "send-kitchen",
    title: "Enviar a cocina",
    durationMin: 3,
    summary: "Un solo envío activa cocina, KDS e impresión térmica.",
    bullets: [
      "Botón «Enviar a cocina» en la comanda",
      "Nuevos ítems después del primer envío van solos al KDS",
      "Estado «En cocina» aparece en el mapa de mesas",
    ],
    tab: "order",
  },
  {
    id: "table-ready",
    title: "Mesa lista",
    durationMin: 4,
    summary: "Recibe alerta sonora y banner cuando cocina termina.",
    bullets: [
      "Banner verde en Comanda y alerta en Mesas",
      "WhatsApp al mesero si tiene celular en Config",
      "Host también ve la cola de mesas pendientes",
    ],
    tab: "host",
  },
  {
    id: "mark-served",
    title: "Servir y cobrar",
    durationMin: 5,
    summary: "Marca servida, luego cobra para liberar la mesa.",
    bullets: [
      "Host o Comanda → «Servida» cuando llevas el plato",
      "Pagar solo si la caja está abierta (Dashboard)",
      "Al cobrar, la mesa se cierra sola",
    ],
    tab: "order",
  },
  {
    id: "tips",
    title: "Propinas",
    durationMin: 3,
    summary: "Registra propina al momento del pago.",
    bullets: [
      "Modal de pago → campo propina o monto sugerido",
      "Aparece en Dashboard y Reporte X del día",
    ],
    tab: "order",
  },
  {
    id: "reservations",
    title: "Reservas y WhatsApp",
    durationMin: 4,
    summary: "Crea reservas con celular y envía confirmación al cliente.",
    bullets: [
      "Mesas → + Reserva → celular del cliente",
      "Vista previa del mensaje antes de guardar",
      "Botones Confirmar / Recordar abren WhatsApp (tú envías)",
    ],
    tab: "tables",
  },
  {
    id: "transfer",
    title: "Transferir mesero",
    durationMin: 3,
    summary: "Cambia el mesero de una mesa abierta sin cerrar la comanda.",
    bullets: [
      "Mesas → mesa ocupada → Transferir",
      "Útil en cambio de turno o relevo",
    ],
    tab: "tables",
    optional: true,
  },
];

export const REQUIRED_WAITER_TRAINING_IDS = WAITER_TRAINING_STEPS
  .filter((s) => !s.optional)
  .map((s) => s.id);
