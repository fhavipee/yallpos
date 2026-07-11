import { Injectable, NotFoundException } from "@nestjs/common";
import { TaxKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { buildEscPosReceipt, ReceiptData } from "./escpos.encoder";
import { aggregateTaxBreakdown } from "../common/tax.util";
import { TaxDefinitionService } from "../tax/tax-definition.service";

@Injectable()
export class ReceiptService {
  constructor(
    private prisma: PrismaService,
    private taxes: TaxDefinitionService,
  ) {}

  private isSimulation() {
    return (process.env.FISCAL_ENV ?? "simulacion") === "simulacion";
  }

  async getReceiptData(branchId: string, invoiceId: string): Promise<ReceiptData> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: { include: { modifiers: true } },
        payments: true,
        fiscalDocuments: { orderBy: { issuedAt: "desc" }, take: 1 },
        branch: { include: { company: true } },
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Venta no encontrada");

    const company = invoice.branch.company;
    const fiscal = invoice.fiscalDocuments[0];
    const simulationMode = this.isSimulation();

    let waiterName: string | undefined;
    if (invoice.waiterId) {
      const waiter = await this.prisma.staff.findUnique({ where: { id: invoice.waiterId } });
      waiterName = waiter?.name;
    }

    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ? `${table.area.name} · ` : ""}Mesa ${table.name}`
      : undefined;

    const deliveryFee = invoice.serviceType === "delivery" ? Number(invoice.deliveryFee ?? 0) : 0;
    let orderLabel: string | undefined;
    let deliveryInfo: ReceiptData["deliveryInfo"];

    if (invoice.serviceType === "delivery") {
      orderLabel = `Domicilio · ${invoice.deliveryName ?? "Sin nombre"}`;
      deliveryInfo = {
        name: invoice.deliveryName ?? undefined,
        phone: invoice.deliveryPhone ?? undefined,
        address: invoice.deliveryAddress ?? undefined,
        reference: invoice.deliveryReference ?? undefined,
        fee: deliveryFee > 0 ? deliveryFee : undefined,
      };
    } else if (invoice.serviceType === "takeaway") {
      const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
      const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
      orderLabel = `Para llevar${code}${name}`;
    } else if (invoice.serviceType === "counter") {
      const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
      const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
      orderLabel = `Mostrador${code}${name}`;
    }

    const taxDefs = await this.taxes.ensureDefaults(company.id);
    const labelMap = this.taxes.buildLabelMap(taxDefs);
    const labelFor = (code: string, kind: "iva" | "consumption") =>
      this.taxes.labelFor(labelMap, kind === "iva" ? TaxKind.iva : TaxKind.consumption, code, code);

    return {
      businessName: company.razonSocial ?? company.name,
      nit: `${company.nit}${company.dv ? `-${company.dv}` : ""}`,
      branchName: invoice.branch.name,
      address: company.address ?? undefined,
      phone: company.phone ?? undefined,
      docNumber: fiscal?.fullNumber ?? invoice.invoiceNumber ?? undefined,
      cude: simulationMode ? undefined : fiscal?.cude ?? undefined,
      isContingency: fiscal?.status === "contingency",
      simulationMode,
      serviceType: invoice.serviceType,
      tableLabel,
      orderLabel,
      deliveryInfo,
      waiterName,
      guestsCount: invoice.guestsCount ?? undefined,
      lines: invoice.lines.map((l) => ({
        name: l.nameSnapshot,
        qty: String(l.qty),
        total: Number(l.lineTotal),
        discount: Number(l.lineDiscount) > 0 ? Number(l.lineDiscount) : undefined,
        modifiers: l.modifiers.map((m) => m.nameSnapshot),
        notes: l.lineNotes ?? undefined,
      })),
      subtotal: Number(invoice.subtotal),
      tax: Number(invoice.tax),
      consumptionTax: Number(invoice.consumptionTax),
      taxBreakdown: aggregateTaxBreakdown(invoice.lines, labelFor),
      discount: Number(invoice.discount) > 0 ? Number(invoice.discount) : undefined,
      total: Number(invoice.total) + Number(invoice.tipAmount) + deliveryFee,
      tip: Number(invoice.tipAmount) || undefined,
      payments: invoice.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
        reference: p.reference ?? undefined,
        authCode: (p as any).authCode ?? undefined,
        lastFour: (p as any).lastFour ?? undefined,
        franchise: (p as any).franchise ?? undefined,
        installments: (p as any).installments ?? undefined,
      })),
      printedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    };
  }

  async getEscPosBase64(branchId: string, invoiceId: string): Promise<{ base64: string; bytes: number }> {
    const data = await this.getReceiptData(branchId, invoiceId);
    const buf = buildEscPosReceipt(data);
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  async getHtmlReceipt(branchId: string, invoiceId: string): Promise<string> {
    const d = await this.getReceiptData(branchId, invoiceId);
    const rows = d.lines
      .map(
        (l) =>
          `<tr><td>${
            l.name
          }${
            l.modifiers?.length ? `<div style="font-size:11px;color:#666">+ ${l.modifiers.join(" · ")}</div>` : ""
          }${
            l.notes ? `<div style="font-size:11px;color:#666">↳ ${l.notes}</div>` : ""
          }</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">$${l.total.toLocaleString("es-CO")}</td></tr>`,
      )
      .join("");

    const docHeader = d.simulationMode
      ? `<div class="center sim"><strong>COMPROBANTE INTERNO</strong><br>NO VÁLIDO FISCAL — Piloto YallPos</div>`
      : `<div class="center"><strong>DOC. EQUIVALENTE POS</strong></div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tiquete</title>
<style>
  @media print { @page { margin: 4mm; size: 80mm auto; } }
  body { font-family: monospace; font-size: 12px; width: 72mm; margin: 0 auto; }
  h1 { font-size: 14px; text-align: center; margin: 4px 0; }
  .center { text-align: center; }
  .sim { color: #b45309; }
  .contingency { color: red; font-weight: bold; text-align: center; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 2px 0; vertical-align: top; }
  .total { font-weight: bold; font-size: 14px; }
  hr { border: none; border-top: 1px dashed #000; }
</style></head><body>
  <h1>${d.businessName}</h1>
  <div class="center">NIT: ${d.nit}</div>
  <div class="center">${d.branchName}</div>
  ${d.address ? `<div class="center">${d.address}</div>` : ""}
  ${d.phone ? `<div class="center">Tel: ${d.phone}</div>` : ""}
  <hr>
  ${docHeader}
  ${
    d.orderLabel
      ? `<div>${d.serviceType === "dine_in" ? "Mesa" : "Pedido"}: ${d.orderLabel}</div>`
      : d.tableLabel
        ? `<div>Mesa: ${d.tableLabel}</div>`
        : ""
  }
  ${
    d.deliveryInfo
      ? `<div style="margin-top:6px;padding:6px 0;border-top:1px dashed #000;border-bottom:1px dashed #000">
          <strong>DOMICILIO</strong><br>
          ${d.deliveryInfo.name ? `Cliente: ${d.deliveryInfo.name}<br>` : ""}
          ${d.deliveryInfo.phone ? `Tel: ${d.deliveryInfo.phone}<br>` : ""}
          ${d.deliveryInfo.address ? `Dir: ${d.deliveryInfo.address}<br>` : ""}
          ${d.deliveryInfo.reference ? `Ref: ${d.deliveryInfo.reference}` : ""}
        </div>`
      : ""
  }
  ${d.waiterName ? `<div>Mesero: ${d.waiterName}</div>` : ""}
  ${d.docNumber && !d.simulationMode ? `<div>No: ${d.docNumber}</div>` : ""}
  ${d.simulationMode && d.docNumber ? `<div>Ref: ${d.docNumber}</div>` : ""}
  ${d.cude ? `<div style="font-size:9px">CUDE: ${d.cude}</div>` : ""}
  ${d.isContingency ? `<div class="contingency">** CONTINGENCIA DIAN **</div>` : ""}
  <div>${d.printedAt}</div>
  <hr>
  <table>${rows}</table>
  <hr>
  <div>Subtotal: $${d.subtotal.toLocaleString("es-CO")}</div>
  ${
    d.taxBreakdown?.length
      ? d.taxBreakdown
          .filter((row) => row.tax > 0)
          .map((row) => `<div>${row.label}: $${row.tax.toLocaleString("es-CO")}</div>`)
          .join("") +
        (d.taxBreakdown.filter((r) => r.tax > 0).length > 1
          ? `<div>Impuestos: $${(d.tax + (d.consumptionTax ?? 0)).toLocaleString("es-CO")}</div>`
          : "")
      : `${
          d.consumptionTax ? `<div>Impoconsumo: $${d.consumptionTax.toLocaleString("es-CO")}</div>` : ""
        }<div>IVA: $${d.tax.toLocaleString("es-CO")}</div>`
  }
  ${d.tip ? `<div>Propina: $${d.tip.toLocaleString("es-CO")}</div>` : ""}
  ${d.deliveryInfo?.fee ? `<div>Domicilio: $${d.deliveryInfo.fee.toLocaleString("es-CO")}</div>` : ""}
  ${d.discount ? `<div>Descuento: -$${d.discount.toLocaleString("es-CO")}</div>` : ""}
  <div class="total">TOTAL: $${d.total.toLocaleString("es-CO")}</div>
  <hr>
  ${d.payments.map((p) => {
    const extra = [
      p.franchise || p.lastFour ? `${p.franchise ?? "TARJETA"}${p.lastFour ? ` ****${p.lastFour}` : ""}` : "",
      p.authCode ? `Auth ${p.authCode}` : "",
      p.installments && p.installments > 1 ? `${p.installments} cuotas` : "",
      p.reference && p.method !== "card" ? `Ref ${p.reference}` : "",
    ].filter(Boolean).join(" · ");
    return `<div>${p.method.toUpperCase()}: $${p.amount.toLocaleString("es-CO")}${extra ? `<div style="font-size:11px;color:#555">${extra}</div>` : ""}</div>`;
  }).join("")}
  <hr>
  <div class="center">Gracias por su visita</div>
  <div class="center" style="font-size:10px">YallPos</div>
</body></html>`;
  }

  async getKitchenHtml(branchId: string, invoiceId: string): Promise<string> {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: { include: { modifiers: true } },
        branch: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Comanda no encontrada");

    let waiterName = "—";
    if (invoice.waiterId) {
      const w = await this.prisma.staff.findUnique({ where: { id: invoice.waiterId } });
      if (w) waiterName = w.name;
    }

    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mostrador";

    const now = new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });
    const rows = invoice.lines
      .map((l) => {
        const modifiers = l.modifiers.length
          ? `<div style="font-size:11px;color:#475569">+ ${l.modifiers.map((m) => m.nameSnapshot).join(" · ")}</div>`
          : "";
        const note = l.lineNotes ? `<div style="font-size:11px;color:#666">↳ ${l.lineNotes}</div>` : "";
        return `<div style="margin-bottom:8px"><strong>${l.qty}× ${l.nameSnapshot}</strong>${modifiers}${note}</div>`;
      })
      .join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda cocina</title>
<style>@media print{@page{margin:4mm;size:80mm auto}}body{font-family:monospace;font-size:13px;width:72mm;margin:0 auto}
h1{font-size:16px;text-align:center;margin:0}.meta{font-size:12px;margin:4px 0}hr{border:none;border-top:2px dashed #000}
</style></head><body>
<h1>🍳 COMANDA COCINA</h1>
<div class="meta"><strong>${tableLabel}</strong></div>
<div class="meta">Mesero: ${waiterName} · ${invoice.guestsCount ?? "?"} comensales</div>
<div class="meta">${now}</div>
<hr>${rows || "<p>Sin ítems</p>"}<hr>
<div style="text-align:center;font-size:11px">YallPos — Restaurante de Yall</div>
<script>window.onload=()=>window.print()</script></body></html>`;
  }

  async getKitchenEscPosBase64(branchId: string, invoiceId: string): Promise<{ base64: string; bytes: number }> {
    const { buildEscPosKitchen } = await import("./escpos.encoder");
    const data = await this.getKitchenData(branchId, invoiceId);
    const buf = buildEscPosKitchen(data);
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  /**
   * Genera un ticket ESC/POS por cada estación KDS con ítems activos.
   * Cada ticket incluye la IP de impresora configurada en la estación (si existe).
   */
  async getKitchenStationTickets(
    branchId: string,
    invoiceId: string,
  ): Promise<{
    tickets: Array<{
      stationId: string;
      stationName: string;
      printerIp: string | null;
      printerPort: number;
      printerName: string | null;
      lineCount: number;
      base64: string;
      bytes: number;
    }>;
  }> {
    const { buildEscPosKitchen } = await import("./escpos.encoder");
    const base = await this.getKitchenData(branchId, invoiceId);

    const kdsItems = await this.prisma.kdsItem.findMany({
      where: {
        ticket: { branchId, invoiceId },
        status: { not: "canceled" },
      },
      include: {
        station: true,
        // invoiceLineId links to sales line
      },
    });

    if (kdsItems.length === 0) {
      // Sin ítems en KDS: un solo ticket genérico (compatibilidad)
      const buf = buildEscPosKitchen(base);
      return {
        tickets: [{
          stationId: "default",
          stationName: "Cocina",
          printerIp: null,
          printerPort: 9100,
          printerName: null,
          lineCount: base.lines.length,
          base64: buf.toString("base64"),
          bytes: buf.length,
        }],
      };
    }

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: { lines: { include: { modifiers: true } } },
    });
    if (!invoice) throw new NotFoundException("Comanda no encontrada");

    const lineById = new Map(invoice.lines.map((l) => [l.id, l]));
    const byStation = new Map<string, {
      station: { id: string; name: string; printerIp: string | null; printerPort: number; printerName: string | null };
      lines: typeof base.lines;
    }>();

    for (const item of kdsItems) {
      const line = lineById.get(item.invoiceLineId);
      if (!line) continue;
      const station = item.station;
      if (!station) continue;
      const key = station.id;
      if (!byStation.has(key)) {
        byStation.set(key, {
          station: {
            id: station.id,
            name: station.name,
            printerIp: station.printerIp,
            printerPort: station.printerPort ?? 9100,
            printerName: station.printerName,
          },
          lines: [],
        });
      }
      byStation.get(key)!.lines.push({
        qty: String(line.qty),
        name: line.nameSnapshot,
        modifiers: line.modifiers.map((m) => m.nameSnapshot),
        notes: line.lineNotes ?? undefined,
      });
    }

    const tickets = [...byStation.values()].map(({ station, lines }) => {
      const buf = buildEscPosKitchen({
        ...base,
        stationName: station.name,
        lines,
      });
      return {
        stationId: station.id,
        stationName: station.name,
        printerIp: station.printerIp,
        printerPort: station.printerPort,
        printerName: station.printerName,
        lineCount: lines.length,
        base64: buf.toString("base64"),
        bytes: buf.length,
      };
    });

    return { tickets };
  }

  async getKitchenVoidHtml(branchId: string, invoiceId: string): Promise<string> {
    const data = await this.getKitchenVoidData(branchId, invoiceId);
    const rows = data.lines
      .map((l) => {
        const note = l.notes ? `<div style="font-size:11px;color:#666">↳ ${l.notes}</div>` : "";
        return `<div style="margin-bottom:8px"><strong>${l.qty}× ${l.name}</strong>${note}</div>`;
      })
      .join("");

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Comanda anulada</title>
<style>@media print{@page{margin:4mm;size:80mm auto}}body{font-family:monospace;font-size:13px;width:72mm;margin:0 auto}
h1{font-size:16px;text-align:center;margin:0;color:#b91c1c}.meta{font-size:12px;margin:4px 0}hr{border:none;border-top:2px dashed #000}
</style></head><body>
<h1>⛔ ANULADO COCINA</h1>
<div class="meta"><strong>${data.tableLabel}</strong></div>
<div class="meta">Mesero: ${data.waiterName} · ${data.guestsCount ?? "?"} comensales</div>
<div class="meta">${data.printedAt}</div>
${data.reason ? `<div class="meta"><strong>Motivo:</strong> ${data.reason}</div>` : ""}
<hr>${rows || "<p>Sin ítems</p>"}<hr>
<div style="text-align:center;font-size:11px;color:#b91c1c"><strong>NO PREPARAR</strong></div>
<script>window.onload=()=>window.print()</script></body></html>`;
  }

  async getKitchenVoidEscPosBase64(branchId: string, invoiceId: string): Promise<{ base64: string; bytes: number }> {
    const { buildEscPosKitchenVoid } = await import("./escpos.encoder");
    const data = await this.getKitchenVoidData(branchId, invoiceId);
    const buf = buildEscPosKitchenVoid(data);
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  async getKitchenLineVoidHtml(
    branchId: string,
    invoiceId: string,
    line: { qty: string; name: string; modifiers?: string[]; notes?: string },
  ): Promise<string> {
    const data = await this.getKitchenLineVoidData(branchId, invoiceId, line);
    const note = line.notes ? `<div style="font-size:11px;color:#666">↳ ${line.notes}</div>` : "";
    const mods = line.modifiers?.length
      ? `<div style="font-size:11px;color:#666">+ ${line.modifiers.join(" · ")}</div>`
      : "";
    const row = `<div style="margin-bottom:8px"><strong>${line.qty}× ${line.name}</strong>${mods}${note}</div>`;

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Producto anulado</title>
<style>@media print{@page{margin:4mm;size:80mm auto}}body{font-family:monospace;font-size:13px;width:72mm;margin:0 auto}
h1{font-size:16px;text-align:center;margin:0;color:#b91c1c}.meta{font-size:12px;margin:4px 0}hr{border:none;border-top:2px dashed #000}
</style></head><body>
<h1>⛔ ANULADO COCINA</h1>
<div class="meta"><strong>${data.tableLabel}</strong></div>
<div class="meta">Mesero: ${data.waiterName} · ${data.guestsCount ?? "?"} comensales</div>
<div class="meta">${data.printedAt}</div>
<hr>${row}<hr>
<div style="text-align:center;font-size:11px;color:#b91c1c"><strong>NO PREPARAR ESTE PRODUCTO</strong></div>
<script>window.onload=()=>window.print()</script></body></html>`;
  }

  async getKitchenLineVoidEscPosBase64(
    branchId: string,
    invoiceId: string,
    line: { qty: string; name: string; modifiers?: string[]; notes?: string },
  ): Promise<{ base64: string; bytes: number }> {
    const { buildEscPosKitchenVoid } = await import("./escpos.encoder");
    const data = await this.getKitchenLineVoidData(branchId, invoiceId, line);
    const buf = buildEscPosKitchenVoid(data);
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  private async getKitchenLineVoidData(
    branchId: string,
    invoiceId: string,
    line: { qty: string; name: string; modifiers?: string[]; notes?: string },
  ) {
    const base = await this.getKitchenData(branchId, invoiceId);
    return {
      ...base,
      lines: [line],
      reason: "Producto anulado desde comanda",
    };
  }

  private async getKitchenData(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: { include: { modifiers: true } },
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Comanda no encontrada");

    let waiterName = "—";
    if (invoice.waiterId) {
      const w = await this.prisma.staff.findUnique({ where: { id: invoice.waiterId } });
      if (w) waiterName = w.name;
    }

    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mostrador";

    return {
      tableLabel,
      waiterName,
      guestsCount: invoice.guestsCount ?? undefined,
      lines: invoice.lines.map((l) => ({
        qty: String(l.qty),
        name: l.nameSnapshot,
        modifiers: l.modifiers.map((m) => m.nameSnapshot),
        notes: l.lineNotes ?? undefined,
      })),
      printedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    };
  }

  private async getKitchenVoidData(branchId: string, invoiceId: string) {
    const base = await this.getKitchenData(branchId, invoiceId);
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      select: { notes: true, serviceType: true, pickupCode: true, pickupName: true, deliveryName: true, tableSessionId: true },
    });
    if (!invoice) throw new NotFoundException("Comanda no encontrada");

    let tableLabel = base.tableLabel;
    if (!invoice.tableSessionId) {
      if (invoice.serviceType === "delivery") {
        tableLabel = `Domicilio · ${invoice.deliveryName ?? "Sin nombre"}`;
      } else if (invoice.serviceType === "takeaway") {
        const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
        const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
        tableLabel = `Para llevar${code}${name}`;
      } else {
        const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
        const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
        tableLabel = `Mostrador${code}${name}`;
      }
    }

    const reasonLine = invoice.notes?.split("\n").find((line) => line.startsWith("[Anulado]"));
    const reason = reasonLine?.replace("[Anulado]", "").trim() || undefined;

    return {
      ...base,
      tableLabel,
      reason,
    };
  }

  async getSeatingSlipEscPosBase64(branchId: string, sessionId: string, reservationId?: string) {
    const { buildEscPosSeatingSlip } = await import("./escpos.encoder");
    const data = await this.getSeatingSlipData(branchId, sessionId, reservationId);
    const buf = buildEscPosSeatingSlip(data);
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  async getSeatingSlipHtml(branchId: string, sessionId: string, reservationId?: string): Promise<string> {
    const data = await this.getSeatingSlipData(branchId, sessionId, reservationId);
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reserva en mesa</title>
<style>@media print{@page{margin:4mm;size:80mm auto}}body{font-family:monospace;font-size:13px;width:72mm;margin:0 auto}
h1{font-size:16px;text-align:center;margin:0}.meta{font-size:12px;margin:4px 0}hr{border:none;border-top:2px dashed #000}
</style></head><body>
<h1>📅 RESERVA · CLIENTE EN MESA</h1>
<div class="meta"><strong>${data.tableLabel}</strong></div>
<div class="meta">Mesero: ${data.waiterName} · ${data.guestsCount} comensales</div>
<div class="meta">Cliente: ${data.customerName}${data.customerPhone ? ` · ${data.customerPhone}` : ""}</div>
${data.reservedFor ? `<div class="meta">Hora reserva: ${data.reservedFor}</div>` : ""}
<div class="meta">${data.printedAt}</div>
${data.notes ? `<hr><div class="meta">Notas: ${data.notes}</div>` : ""}
<hr><div style="text-align:center;font-size:11px">YallPos</div>
<script>window.onload=()=>window.print()</script></body></html>`;
  }

  private async getSeatingSlipData(branchId: string, sessionId: string, reservationId?: string) {
    const session = await this.prisma.tableSession.findFirst({
      where: { id: sessionId, branchId },
      include: { table: { include: { area: true } } },
    });
    if (!session) throw new NotFoundException("Sesion de mesa no encontrada");

    const reservation = reservationId
      ? await this.prisma.reservation.findFirst({ where: { id: reservationId, branchId } })
      : session.id
        ? await this.prisma.reservation.findFirst({
            where: { branchId, tableSessionId: sessionId },
            orderBy: { seatedAt: "desc" },
          })
        : null;

    let waiterName = "—";
    if (session.waiterId) {
      const w = await this.prisma.staff.findUnique({ where: { id: session.waiterId } });
      if (w) waiterName = w.name;
    }

    const table = session.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mesa";

    const reservedFor = reservation?.reservedFor
      ? new Date(reservation.reservedFor).toLocaleString("es-CO", { timeZone: "America/Bogota" })
      : undefined;

    return {
      tableLabel,
      waiterName,
      guestsCount: session.guestsCount ?? reservation?.guestsCount ?? 1,
      customerName: reservation?.customerName ?? "Cliente",
      customerPhone: reservation?.customerPhone ?? undefined,
      notes: reservation?.notes ?? undefined,
      reservedFor,
      printedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    };
  }

  async incrementPrintCount(invoiceId: string) {
    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { printedCount: { increment: 1 } },
    });
  }
}
