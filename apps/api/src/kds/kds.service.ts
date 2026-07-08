import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { KdsGateway } from "./kds.gateway";
import { OrderNotifyService } from "../notifications/order-notify.service";
import { releasePickupLocatorIfComplete } from "../pos/pickup-locator.helper";

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
        ...(status ? { status: status as any } : { status: { notIn: ["served", "canceled"] as any } }),
      },
      orderBy: { createdAt: "asc" },
      include: { ticket: true, station: true },
    });

    if (items.length === 0) return [];

    const invoiceIds = [...new Set(items.map((i) => i.ticket.invoiceId))];
    const invoices = await this.prisma.salesInvoice.findMany({
      where: { id: { in: invoiceIds }, branchId },
      select: {
        id: true,
        serviceType: true,
        pickupCode: true,
        pickupName: true,
        deliveryName: true,
      },
    });
    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    const lineIds = items.map((i) => i.invoiceLineId);
    const lines = await this.prisma.salesInvoiceLine.findMany({
      where: { id: { in: lineIds } },
      include: { modifiers: true },
    });
    const lineMap = new Map(lines.map((l) => [l.id, l]));

    const tableIds = [...new Set(items.map((i) => i.ticket.tableId).filter(Boolean))] as string[];
    const tables = tableIds.length
      ? await this.prisma.table.findMany({ where: { id: { in: tableIds } }, include: { area: true } })
      : [];
    const tableMap = new Map(tables.map((t) => [t.id, t]));

    return items.map((item) => {
      const line = lineMap.get(item.invoiceLineId);
      const table = item.ticket.tableId ? tableMap.get(item.ticket.tableId) : null;
      const invoice = invoiceMap.get(item.ticket.invoiceId);
      const elapsedMin = Math.floor((Date.now() - item.createdAt.getTime()) / 60000);
      return {
        ...item,
        ticketId: item.ticketId,
        invoiceId: item.ticket.invoiceId,
        productName: line?.nameSnapshot ?? "Producto",
        qty: Number(line?.qty ?? 1),
        lineNotes: line?.lineNotes,
        modifiers: line?.modifiers?.map((m) => m.nameSnapshot) ?? [],
        tableName: table?.name ?? null,
        areaName: table?.area?.name ?? null,
        serviceType: invoice?.serviceType ?? null,
        pickupCode: invoice?.pickupCode ?? null,
        pickupName: invoice?.pickupName ?? invoice?.deliveryName ?? null,
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
    if (status === "ready" || status === "served") {
      if (status === "ready") {
        pickupNotify = await this.orderNotify.tryNotifyPickupReady(branchId, item.ticket.invoiceId);
      }
      tableReady = await this.orderNotify.tryNotifyTableReady(branchId, item.ticket.invoiceId);
      if (tableReady?.notified) {
        this.gateway.emitTableReady(branchId, tableReady);
      }
    }

    if (status === "served") {
      await releasePickupLocatorIfComplete(this.prisma, branchId, item.ticket.invoiceId);
    }

    return { item, pickupNotify, tableReady };
  }

  private async updateInvoiceItemsStatus(
    branchId: string,
    invoiceId: string,
    from: Array<"new" | "preparing" | "ready">,
    to: "preparing" | "ready" | "served",
  ) {
    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });
    if (!ticket) return { ok: false, updated: 0 };

    const targets = ticket.items.filter((item) => from.includes(item.status as any));

    const now = new Date();
    for (const item of targets) {
      await this.prisma.kdsItem.update({
        where: { id: item.id },
        data: {
          status: to as any,
          startedAt: to === "preparing" ? (item.startedAt ?? now) : item.startedAt ?? undefined,
          readyAt: to === "ready" ? now : undefined,
          servedAt: to === "served" ? now : undefined,
        },
      });
      this.gateway.emitKdsItemUpdated(branchId, item.stationId, {
        ...item,
        status: to,
        readyAt: to === "ready" ? now : item.readyAt,
        servedAt: to === "served" ? now : item.servedAt,
      });
    }

    let pickupNotify = null;
    let tableReady = null;
    if (to === "ready" || to === "served") {
      if (to === "ready") {
        pickupNotify = await this.orderNotify.tryNotifyPickupReady(branchId, invoiceId);
      }
      tableReady = await this.orderNotify.tryNotifyTableReady(branchId, invoiceId);
      if (tableReady?.notified) {
        this.gateway.emitTableReady(branchId, tableReady);
      }
    }

    if (to === "served") {
      await releasePickupLocatorIfComplete(this.prisma, branchId, invoiceId);
    }

    return { ok: true, updated: targets.length, pickupNotify, tableReady };
  }

  async markInvoicePreparing(branchId: string, invoiceId: string) {
    return this.updateInvoiceItemsStatus(branchId, invoiceId, ["new"], "preparing");
  }

  async markInvoiceReady(branchId: string, invoiceId: string) {
    return this.updateInvoiceItemsStatus(branchId, invoiceId, ["new", "preparing"], "ready");
  }

  async markInvoiceServedFromKds(branchId: string, invoiceId: string) {
    return this.updateInvoiceItemsStatus(branchId, invoiceId, ["ready"], "served");
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

    await releasePickupLocatorIfComplete(this.prisma, branchId, invoiceId);

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

  async cancelLineItems(branchId: string, invoiceId: string, lineId: string) {
    const items = await this.prisma.kdsItem.findMany({
      where: {
        invoiceLineId: lineId,
        ticket: { branchId, invoiceId },
        status: { notIn: ["served", "canceled"] },
      },
    });
    if (items.length === 0) return { ok: false, updated: 0 };

    await this.prisma.kdsItem.updateMany({
      where: { id: { in: items.map((item) => item.id) } },
      data: { status: "canceled" },
    });

    for (const item of items) {
      this.gateway.emitKdsItemUpdated(branchId, item.stationId, {
        ...item,
        status: "canceled",
      });
    }

    return { ok: true, updated: items.length };
  }

  notifyLineVoided(
    branchId: string,
    payload: {
      invoiceId: string;
      lineId: string;
      label: string;
      productName: string;
      qty: number;
      tableSessionId?: string | null;
      tableId?: string | null;
      serviceType?: string;
      actor?: "waiter" | "kitchen";
    },
  ) {
    this.gateway.emitLineVoided(branchId, payload);
  }

  notifyInvoiceUpdated(
    branchId: string,
    payload: {
      invoiceId: string;
      tableSessionId?: string | null;
      tableId?: string | null;
      serviceType?: string;
      changeType: "line-discount" | "invoice-discount" | "line-removed";
      lineId?: string;
      productName?: string;
    },
  ) {
    this.gateway.emitInvoiceUpdated(branchId, payload);
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
