import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { KdsGateway } from "./kds.gateway";
import { OrderNotifyService } from "../notifications/order-notify.service";

@Injectable()
export class KdsService {
  constructor(
    private prisma: PrismaService,
    private gateway: KdsGateway,
    private orderNotify: OrderNotifyService,
  ) {}

  async getStations(branchId: string) {
    return this.prisma.kdsStation.findMany({ where: { branchId, isActive: true }, orderBy: { name: "asc" } });
  }

  async getItemsByStation(branchId: string, stationId: string, status?: string) {
    const items = await this.prisma.kdsItem.findMany({
      where: {
        stationId,
        ticket: { branchId },
        ...(status ? { status: status as any } : { status: { not: "served" as any } }),
      },
      orderBy: { createdAt: "asc" },
      include: { ticket: true, station: true },
    });

    if (items.length === 0) return [];

    const lineIds = items.map((i) => i.invoiceLineId);
    const lines = await this.prisma.salesInvoiceLine.findMany({ where: { id: { in: lineIds } } });
    const lineMap = new Map(lines.map((l) => [l.id, l]));

    const tableIds = [...new Set(items.map((i) => i.ticket.tableId).filter(Boolean))] as string[];
    const tables = tableIds.length
      ? await this.prisma.table.findMany({ where: { id: { in: tableIds } }, include: { area: true } })
      : [];
    const tableMap = new Map(tables.map((t) => [t.id, t]));

    return items.map((item) => {
      const line = lineMap.get(item.invoiceLineId);
      const table = item.ticket.tableId ? tableMap.get(item.ticket.tableId) : null;
      const elapsedMin = Math.floor((Date.now() - item.createdAt.getTime()) / 60000);
      return {
        ...item,
        invoiceId: item.ticket.invoiceId,
        productName: line?.nameSnapshot ?? "Producto",
        qty: line?.qty ?? 1,
        lineNotes: line?.lineNotes,
        tableName: table?.name ?? null,
        areaName: table?.area?.name ?? null,
        elapsedMin,
      };
    });
  }

  async updateItemStatus(branchId: string, itemId: string, status: "new"|"preparing"|"ready"|"served"|"canceled") {
    const item = await this.prisma.kdsItem.update({
      where: { id: itemId },
      data: {
        status: status as any,
        startedAt: status === "preparing" ? new Date() : undefined,
        readyAt: status === "ready" ? new Date() : undefined,
        servedAt: status === "served" ? new Date() : undefined,
      },
      include: { ticket: true, station: true },
    });

    this.gateway.emitKdsItemUpdated(branchId, item.stationId, item);

    let pickupNotify = null;
    let tableReady = null;
    if (status === "ready") {
      pickupNotify = await this.orderNotify.tryNotifyPickupReady(branchId, item.ticket.invoiceId);
      tableReady = await this.orderNotify.tryNotifyTableReady(branchId, item.ticket.invoiceId);
      if (tableReady?.notified) {
        this.gateway.emitTableReady(branchId, tableReady);
      }
    }

    return { item, pickupNotify, tableReady };
  }

  async markInvoiceServed(branchId: string, invoiceId: string) {
    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });
    if (!ticket) return { ok: false, updated: 0 };

    const pending = ticket.items.filter((item) => item.status !== "served" && item.status !== "canceled");
    if (pending.length === 0) return { ok: true, updated: 0 };

    const servedAt = new Date();
    await this.prisma.kdsItem.updateMany({
      where: { id: { in: pending.map((item) => item.id) } },
      data: { status: "served", servedAt },
    });

    for (const item of pending) {
      this.gateway.emitKdsItemUpdated(branchId, item.stationId, {
        ...item,
        status: "served",
        servedAt,
      });
    }

    return { ok: true, updated: pending.length };
  }

  async cancelInvoiceItems(branchId: string, invoiceId: string) {
    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });
    if (!ticket) return { ok: false, updated: 0 };

    const pending = ticket.items.filter((item) => item.status !== "served" && item.status !== "canceled");
    if (pending.length === 0) {
      await this.prisma.kdsTicket.update({
        where: { id: ticket.id },
        data: { status: "canceled" },
      });
      return { ok: true, updated: 0 };
    }

    await this.prisma.kdsItem.updateMany({
      where: { id: { in: pending.map((item) => item.id) } },
      data: { status: "canceled" },
    });

    for (const item of pending) {
      this.gateway.emitKdsItemUpdated(branchId, item.stationId, {
        ...item,
        status: "canceled",
      });
    }

    await this.prisma.kdsTicket.update({
      where: { id: ticket.id },
      data: { status: "canceled" },
    });

    return { ok: true, updated: pending.length };
  }

  notifyInvoiceVoided(
    branchId: string,
    payload: { invoiceId: string; label: string; reason?: string | null; serviceType?: string },
  ) {
    this.gateway.emitInvoiceVoided(branchId, payload);
  }

  async upsertTicketFromInvoice(branchId: string, invoice: any) {
    const existing = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId: invoice.id },
      include: { items: true },
    });

    const ticket = existing
      ? await this.prisma.kdsTicket.update({
          where: { id: existing.id },
          data: { status: "new", tableId: invoice.tableId, waiterId: invoice.waiterId },
        })
      : await this.prisma.kdsTicket.create({
          data: { branchId, invoiceId: invoice.id, status: "new", tableId: invoice.tableId, waiterId: invoice.waiterId },
        });

    const stations = await this.getStations(branchId);
    const rules = await this.prisma.kdsRoutingRule.findMany({ where: { branchId } });

    const existingLineIds = new Set((existing?.items ?? []).map((x: any) => x.invoiceLineId));
    const newLines = invoice.lines.filter((l: any) => !existingLineIds.has(l.id));

    if (newLines.length > 0 && invoice.serviceType === "dine_in") {
      await this.prisma.salesInvoice.update({
        where: { id: invoice.id },
        data: { tableReadyNotifiedAt: null, tableReadyServedAt: null, tableReadyOverdueNotifiedAt: null },
      });
    }

    for (const line of newLines) {
      const course = line.course ?? null;
      const ruleByVariant = rules.find((r: any) => r.variantId && r.variantId === line.variantId);
      const ruleByCourse = rules.find((r: any) => r.course && r.course === course);
      const stationId = ruleByVariant?.stationId ?? ruleByCourse?.stationId ?? stations[0]?.id;
      if (!stationId) continue;

      const kdsItem = await this.prisma.kdsItem.create({
        data: { ticketId: ticket.id, invoiceLineId: line.id, stationId, course, status: "new" },
        include: { station: true, ticket: true },
      });

      this.gateway.emitKdsTicketCreated(branchId, stationId, {
        ticketId: ticket.id,
        invoiceId: invoice.id,
        tableId: invoice.tableId,
        item: kdsItem,
        productName: line.nameSnapshot,
      });
    }

    return ticket;
  }

  notifyTableUpdated(branchId: string, payload: any) {
    this.gateway.emitTableUpdated(branchId, payload);
  }

  notifyInvoicePaid(branchId: string, invoiceId: string) {
    this.gateway.emitInvoicePaid(branchId, { invoiceId });
  }

  notifyTableServed(branchId: string, payload: any) {
    this.gateway.emitTableServed(branchId, payload);
  }
}
