/**
 * Codificador ESC/POS para impresoras térmicas 58mm/80mm.
 * Compatible con Epson, Star, Bixolon y la mayoría de clones.
 */
export class EscPosEncoder {
  private buffer: number[] = [];

  private append(...bytes: number[]) {
    this.buffer.push(...bytes);
  }

  private text(str: string) {
    for (let i = 0; i < str.length; i++) {
      this.buffer.push(str.charCodeAt(i) & 0xff);
    }
  }

  init() {
    this.append(0x1b, 0x40); // ESC @
    return this;
  }

  align(mode: "left" | "center" | "right") {
    const n = mode === "left" ? 0 : mode === "center" ? 1 : 2;
    this.append(0x1b, 0x61, n);
    return this;
  }

  bold(on = true) {
    this.append(0x1b, 0x45, on ? 1 : 0);
    return this;
  }

  size(width = 1, height = 1) {
    const n = ((width - 1) << 4) | (height - 1);
    this.append(0x1d, 0x21, n);
    return this;
  }

  line(str = "") {
    this.text(str);
    this.append(0x0a);
    return this;
  }

  separator(char = "-", width = 32) {
    return this.line(char.repeat(width));
  }

  cut() {
    this.append(0x1d, 0x56, 0x00); // GS V 0 — corte total
    return this;
  }

  feed(lines = 3) {
    for (let i = 0; i < lines; i++) this.append(0x0a);
    return this;
  }

  toBuffer(): Buffer {
    return Buffer.from(this.buffer);
  }

  toBase64(): string {
    return this.toBuffer().toString("base64");
  }
}

export type ReceiptLine = { name: string; qty: string; total: number; modifiers?: string[]; notes?: string };

export type ReceiptData = {
  businessName: string;
  nit: string;
  branchName: string;
  address?: string;
  phone?: string;
  docNumber?: string;
  cude?: string;
  isContingency?: boolean;
  simulationMode?: boolean;
  serviceType?: string;
  tableLabel?: string;
  orderLabel?: string;
  waiterName?: string;
  guestsCount?: number;
  deliveryInfo?: {
    name?: string;
    phone?: string;
    address?: string;
    reference?: string;
    fee?: number;
  };
  lines: ReceiptLine[];
  subtotal: number;
  tax: number;
  consumptionTax?: number;
  taxBreakdown?: { label: string; base: number; tax: number }[];
  discount?: number;
  total: number;
  payments: {
    method: string;
    amount: number;
    reference?: string;
    authCode?: string;
    lastFour?: string;
    franchise?: string;
    installments?: number;
  }[];
  tip?: number;
  cashier?: string;
  printedAt: string;
};

export function buildEscPosReceipt(data: ReceiptData, paperWidth = 32): Buffer {
  const enc = new EscPosEncoder().init();

  enc.align("center").bold(true).size(2, 2).line(data.businessName).size(1, 1).bold(false);
  enc.line(`NIT: ${data.nit}`);
  enc.line(data.branchName);
  if (data.address) enc.line(data.address);
  enc.separator("=", paperWidth);

  enc.align("left").bold(true);
  if (data.simulationMode) {
    enc.line("COMPROBANTE INTERNO").line("NO VALIDO FISCAL");
  } else {
    enc.line("DOCUMENTO EQUIVALENTE POS");
  }
  enc.bold(false);
  if (data.orderLabel) {
    enc.line(data.serviceType === "dine_in" ? `Mesa: ${data.orderLabel}` : data.orderLabel);
  } else if (data.tableLabel) {
    enc.line(`Mesa: ${data.tableLabel}`);
  }
  if (data.deliveryInfo) {
    enc.bold(true).line("DOMICILIO").bold(false);
    if (data.deliveryInfo.name) enc.line(`Cliente: ${data.deliveryInfo.name}`);
    if (data.deliveryInfo.phone) enc.line(`Tel: ${data.deliveryInfo.phone}`);
    if (data.deliveryInfo.address) enc.line(`Dir: ${data.deliveryInfo.address}`);
    if (data.deliveryInfo.reference) enc.line(`Ref: ${data.deliveryInfo.reference}`);
  }
  if (data.waiterName) enc.line(`Mesero: ${data.waiterName}`);
  if (data.guestsCount) enc.line(`Comensales: ${data.guestsCount}`);
  if (data.docNumber && !data.simulationMode) enc.line(`No: ${data.docNumber}`);
  if (data.cude && !data.simulationMode) enc.line(`CUDE: ${data.cude.slice(0, 16)}...`);
  if (data.simulationMode && data.docNumber) enc.line(`Ref: ${data.docNumber}`);
  if (data.isContingency) enc.bold(true).line("** CONTINGENCIA **").bold(false);
  enc.line(`Fecha: ${data.printedAt}`);
  enc.separator("-", paperWidth);

  for (const l of data.lines) {
    const name = l.name.length > 22 ? l.name.slice(0, 22) : l.name;
    enc.line(`${name}`);
    if (l.modifiers?.length) enc.line(`  + ${l.modifiers.join(" · ")}`);
    if (l.notes) enc.line(`  > ${l.notes}`);
    enc.line(`  ${l.qty} x $${l.total.toLocaleString("es-CO")}`);
  }

  enc.separator("-", paperWidth);
  enc.line(`Subtotal: $${data.subtotal.toLocaleString("es-CO")}`);
  if (data.taxBreakdown?.length) {
    for (const row of data.taxBreakdown) {
      if (row.tax > 0) {
        enc.line(`${row.label}: $${row.tax.toLocaleString("es-CO")}`);
      }
    }
  } else {
    if (data.consumptionTax) {
      enc.line(`Impoconsumo: $${data.consumptionTax.toLocaleString("es-CO")}`);
    }
    enc.line(`IVA:      $${data.tax.toLocaleString("es-CO")}`);
  }
  const totalTax = data.tax + (data.consumptionTax ?? 0);
  if (data.taxBreakdown?.length && data.taxBreakdown.filter((r) => r.tax > 0).length > 1) {
    enc.line(`Impuestos: $${totalTax.toLocaleString("es-CO")}`);
  }
  if (data.tip) enc.line(`Propina:  $${data.tip.toLocaleString("es-CO")}`);
  if (data.deliveryInfo?.fee) {
    enc.line(`Domicilio: $${data.deliveryInfo.fee.toLocaleString("es-CO")}`);
  }
  if (data.discount) {
    enc.line(`Descuento: -$${data.discount.toLocaleString("es-CO")}`);
  }
  enc.bold(true).line(`TOTAL:    $${data.total.toLocaleString("es-CO")}`).bold(false);

  enc.separator("-", paperWidth);
  for (const p of data.payments) {
    enc.line(`${p.method.toUpperCase()}: $${p.amount.toLocaleString("es-CO")}`);
    if (p.franchise || p.lastFour) {
      enc.line(`  ${(p.franchise ?? "TARJETA")}${p.lastFour ? ` ****${p.lastFour}` : ""}`);
    }
    if (p.authCode) enc.line(`  Auth: ${p.authCode}`);
    if (p.installments && p.installments > 1) enc.line(`  Cuotas: ${p.installments}`);
    if (p.reference && p.method !== "card") enc.line(`  Ref: ${p.reference}`);
  }

  enc.separator("=", paperWidth);
  enc.align("center").line("Gracias por su compra");
  enc.line("YallPos · yallpos.co");
  enc.feed(2).cut();

  return enc.toBuffer();
}

export type KitchenTicketData = {
  tableLabel: string;
  waiterName: string;
  guestsCount?: number;
  stationName?: string;
  lines: { qty: string; name: string; modifiers?: string[]; notes?: string }[];
  printedAt: string;
};

export type KitchenVoidTicketData = KitchenTicketData & {
  reason?: string;
};

export function buildEscPosKitchen(data: KitchenTicketData, paperWidth = 32): Buffer {
  const enc = new EscPosEncoder().init();

  enc.align("center").bold(true).size(2, 2).line("COMANDA").size(1, 1).bold(false);
  enc.line((data.stationName || "COCINA").toUpperCase());
  enc.separator("=", paperWidth);
  enc.align("left").bold(true).line(data.tableLabel).bold(false);
  enc.line(`Mesero: ${data.waiterName}`);
  if (data.guestsCount) enc.line(`Comensales: ${data.guestsCount}`);
  enc.line(data.printedAt);
  enc.separator("-", paperWidth);

  for (const l of data.lines) {
    enc.bold(true).line(`${l.qty}x ${l.name}`).bold(false);
    if (l.modifiers?.length) enc.line(`  + ${l.modifiers.join(" · ")}`);
    if (l.notes) enc.line(`  > ${l.notes}`);
  }

  enc.separator("=", paperWidth);
  enc.align("center").line("YallPos");
  enc.feed(2).cut();
  return enc.toBuffer();
}

export function buildEscPosKitchenVoid(data: KitchenVoidTicketData, paperWidth = 32): Buffer {
  const enc = new EscPosEncoder().init();

  enc.align("center").bold(true).size(2, 2).line("ANULADO").size(1, 1).bold(false);
  enc.line("COCINA");
  enc.separator("=", paperWidth);
  enc.align("left").bold(true).line(data.tableLabel).bold(false);
  enc.line(`Mesero: ${data.waiterName}`);
  if (data.guestsCount) enc.line(`Comensales: ${data.guestsCount}`);
  enc.line(data.printedAt);
  if (data.reason) enc.line(`Motivo: ${data.reason}`);
  enc.separator("-", paperWidth);

  for (const l of data.lines) {
    enc.bold(true).line(`${l.qty}x ${l.name}`).bold(false);
    if (l.modifiers?.length) enc.line(`  + ${l.modifiers.join(" · ")}`);
    if (l.notes) enc.line(`  > ${l.notes}`);
  }

  enc.separator("=", paperWidth);
  enc.align("center").line("NO PREPARAR");
  enc.feed(2).cut();
  return enc.toBuffer();
}

export type SeatingSlipData = {
  tableLabel: string;
  waiterName: string;
  guestsCount: number;
  customerName: string;
  customerPhone?: string;
  notes?: string;
  reservedFor?: string;
  printedAt: string;
};

export function buildEscPosSeatingSlip(data: SeatingSlipData, paperWidth = 32): Buffer {
  const enc = new EscPosEncoder().init();

  enc.align("center").bold(true).size(2, 2).line("RESERVA").size(1, 1).bold(false);
  enc.line("CLIENTE EN MESA");
  enc.separator("=", paperWidth);
  enc.align("left").bold(true).line(data.tableLabel).bold(false);
  enc.line(`Mesero: ${data.waiterName}`);
  enc.line(`Comensales: ${data.guestsCount}`);
  enc.line(`Cliente: ${data.customerName}`);
  if (data.customerPhone) enc.line(`Tel: ${data.customerPhone}`);
  if (data.reservedFor) enc.line(`Reserva: ${data.reservedFor}`);
  enc.line(data.printedAt);
  if (data.notes) {
    enc.separator("-", paperWidth);
    enc.line(`Notas: ${data.notes}`);
  }
  enc.separator("=", paperWidth);
  enc.align("center").line("YallPos");
  enc.feed(2).cut();
  return enc.toBuffer();
}

export type ReportXData = {
  businessName: string;
  branchName: string;
  openedAt: string;
  openingCash: number;
  totalSales: number;
  totalTips: number;
  expectedCash: number;
  invoiceCount: number;
  paymentsByMethod: Record<string, number>;
  printedAt: string;
};

export type CashReportEscPosData = {
  reportType: "X" | "Z";
  businessName: string;
  branchName: string;
  cashRegisterName?: string | null;
  openedAt: string;
  closedAt?: string | null;
  openingCash: number;
  closingCash?: number | null;
  cashDifference?: number | null;
  totalSales: number;
  totalTips: number;
  expectedCash: number;
  cashSales?: number;
  deposits?: number;
  withdrawals?: number;
  expenses?: number;
  invoiceCount: number;
  paymentsByMethod: Record<string, number>;
  movements?: { type: string; amount: number; reason?: string | null }[];
  notes?: string | null;
  printedAt: string;
};

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  qr: "QR",
  credit: "Credito",
  voucher: "Vale",
  mixed: "Mixto",
};

const MOVEMENT_LABELS: Record<string, string> = {
  deposit: "Deposito",
  withdrawal: "Retiro",
  expense: "Gasto",
};

export function buildEscPosCashReport(data: CashReportEscPosData, paperWidth = 32): Buffer {
  const enc = new EscPosEncoder().init();
  const title = data.reportType === "Z" ? "REPORTE Z" : "REPORTE X";

  enc.align("center").bold(true).size(2, 2).line(title).size(1, 1).bold(false);
  enc.line(data.businessName);
  enc.line(data.branchName);
  if (data.cashRegisterName) enc.line(data.cashRegisterName);
  enc.separator("=", paperWidth);
  enc.align("left");
  enc.line(`Apertura: ${data.openedAt}`);
  if (data.closedAt) enc.line(`Cierre:   ${data.closedAt}`);
  enc.line(`Impreso:  ${data.printedAt}`);
  enc.separator("-", paperWidth);
  enc.line(`Ventas:        $${data.totalSales.toLocaleString("es-CO")}`);
  enc.line(`Transacciones: ${data.invoiceCount}`);
  enc.line(`Propinas:      $${data.totalTips.toLocaleString("es-CO")}`);
  enc.line(`Apertura caja: $${data.openingCash.toLocaleString("es-CO")}`);
  if (data.cashSales != null) enc.line(`Ventas efectivo:$${data.cashSales.toLocaleString("es-CO")}`);
  if (data.deposits) enc.line(`Depositos:     $${data.deposits.toLocaleString("es-CO")}`);
  if (data.withdrawals) enc.line(`Retiros:       $${data.withdrawals.toLocaleString("es-CO")}`);
  if (data.expenses) enc.line(`Gastos:        $${data.expenses.toLocaleString("es-CO")}`);
  enc.line(`Efectivo esp.: $${data.expectedCash.toLocaleString("es-CO")}`);
  if (data.closingCash != null) {
    enc.line(`Efectivo cont.:$${data.closingCash.toLocaleString("es-CO")}`);
    enc.line(`Diferencia:    $${(data.cashDifference ?? 0).toLocaleString("es-CO")}`);
  }
  enc.separator("-", paperWidth);
  enc.bold(true).line("Medios de pago").bold(false);
  for (const [method, amount] of Object.entries(data.paymentsByMethod)) {
    const label = PAYMENT_LABELS[method] ?? method;
    enc.line(`${label}: $${amount.toLocaleString("es-CO")}`);
  }
  if (data.movements && data.movements.length > 0) {
    enc.separator("-", paperWidth);
    enc.bold(true).line("Movimientos").bold(false);
    for (const m of data.movements) {
      const label = MOVEMENT_LABELS[m.type] ?? m.type;
      const reason = m.reason ? ` ${m.reason}` : "";
      enc.line(`${label}: $${m.amount.toLocaleString("es-CO")}${reason}`);
    }
  }
  if (data.notes) {
    enc.separator("-", paperWidth);
    enc.line(`Notas: ${data.notes}`);
  }
  enc.separator("=", paperWidth);
  enc.align("center").line(
    data.reportType === "Z" ? "Cierre de caja (Z)" : "Caja abierta — no es cierre Z",
  );
  enc.feed(2).cut();
  return enc.toBuffer();
}

/** @deprecated use buildEscPosCashReport */
export function buildEscPosReportX(data: ReportXData, paperWidth = 32): Buffer {
  return buildEscPosCashReport({ ...data, reportType: "X" }, paperWidth);
}

export function buildEscPosTest(): Buffer {
  return buildEscPosReceipt({
    businessName: "YallPos Test",
    nit: "900123456-7",
    branchName: "Restaurante de Yall",
    simulationMode: true,
    lines: [{ name: "Producto prueba", qty: "1", total: 5000 }],
    subtotal: 4202,
    tax: 798,
    total: 5000,
    payments: [{ method: "cash", amount: 5000 }],
    printedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
  });
}
