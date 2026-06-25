import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { AddLineDto } from "./dto/add-line.dto";
import { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import { UpdatePickupDto } from "./dto/update-pickup.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";
import { KdsService } from "../kds/kds.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { OrderNotifyService } from "../notifications/order-notify.service";
import {
  buildPickupReadySmsLink,
  buildPickupReadyWhatsAppLink,
  buildTableOverdueHostWhatsAppLink,
  buildTableOverdueWaiterWhatsAppLink,
  buildTableReadyWaiterWhatsAppLink,
} from "../restaurant/reservation-notify.util";
import { readBranchNotificationSettings } from "../settings/branch-notifications.util";
import { calcLineAmountsFromRates } from "../common/tax.util";
import { TaxDefinitionService } from "../tax/tax-definition.service";

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private kds: KdsService,
    private fiscal: FiscalService,
    private orderNotify: OrderNotifyService,
    private taxes: TaxDefinitionService,
  ) {}

  private async getBranchNotificationSettings(branchId: string) {
    const settings = await readBranchNotificationSettings(this.prisma, branchId);
    if (!settings) {
      return {
        tableReadyWarnMinutes: 10,
        tableReadyOverdueSoundEnabled: true,
        tableReadyOverdueWebhookEnabled: true,
        tableReadyHostWhatsAppEnabled: true,
        tableReadyWaiterWhatsAppEnabled: true,
        hostPhone: undefined as string | undefined,
      };
    }
    return {
      tableReadyWarnMinutes: settings.tableReadyWarnMinutes,
      tableReadyOverdueSoundEnabled: true,
      tableReadyOverdueWebhookEnabled: settings.tableReadyOverdueWebhookEnabled,
      tableReadyHostWhatsAppEnabled: settings.tableReadyHostWhatsAppEnabled,
      tableReadyWaiterWhatsAppEnabled: settings.tableReadyWaiterWhatsAppEnabled,
      hostPhone: settings.hostPhone,
    };
  }

  async listOpenInvoicesForTableSession(branchId: string, tableSessionId: string) {
    const ts = await this.prisma.tableSession.findFirst({ where: { id: tableSessionId, branchId } });
    if (!ts || ts.status !== "open") throw new BadRequestException("Invalid table session");

    return this.prisma.salesInvoice.findMany({
      where: { branchId, tableSessionId, status: { in: ["draft", "sent_to_kitchen"] as any } },
      orderBy: { createdAt: "asc" },
      include: {
        lines: { include: { modifiers: true } },
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
  }

  async getOrCreateDraftByTableSession(
    branchId: string,
    companyId: string,
    tableSessionId: string,
    invoiceId?: string,
  ) {
    const ts = await this.prisma.tableSession.findFirst({ where: { id: tableSessionId, branchId } });
    if (!ts || ts.status !== "open") throw new BadRequestException("Invalid table session");

    const openSession = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });

    const invoiceInclude = {
      lines: { include: { modifiers: true } },
      payments: true,
      fiscalDocuments: true,
      tableSession: { include: { table: { include: { area: true } } } },
    };

    if (invoiceId) {
      const selected = await this.prisma.salesInvoice.findFirst({
        where: {
          id: invoiceId,
          branchId,
          tableSessionId,
          status: { in: ["draft", "sent_to_kitchen"] as any },
        },
        include: invoiceInclude,
      });
      if (!selected) throw new NotFoundException("Comanda no encontrada");
      if (selected.waiterId !== ts.waiterId) {
        return this.prisma.salesInvoice.update({
          where: { id: selected.id },
          data: { waiterId: ts.waiterId },
          include: invoiceInclude,
        });
      }
      return selected;
    }

    const existing = await this.prisma.salesInvoice.findFirst({
      where: { branchId, tableSessionId, status: { in: ["draft", "sent_to_kitchen"] as any } },
      orderBy: { createdAt: "desc" },
      include: invoiceInclude,
    });

    if (existing) {
      if (existing.waiterId !== ts.waiterId) {
        return this.prisma.salesInvoice.update({
          where: { id: existing.id },
          data: { waiterId: ts.waiterId },
          include: invoiceInclude,
        });
      }
      return existing;
    }

    return this.prisma.salesInvoice.create({
      data: {
        companyId,
        branchId,
        sessionId: openSession?.id ?? null,
        status: "draft",
        serviceType: "dine_in",
        tableSessionId,
        tableId: ts.tableId,
        waiterId: ts.waiterId,
        guestsCount: ts.guestsCount ?? null,
      },
      include: invoiceInclude,
    });
  }

  private readonly counterStyleInclude = {
    lines: { include: { modifiers: true } },
    payments: true,
    fiscalDocuments: true,
  };

  private async getOrCreateEmptyCounterStyleDraft(
    branchId: string,
    companyId: string,
    serviceType: "counter" | "takeaway" | "delivery",
  ) {
    const session = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });
    if (!session) throw new BadRequestException("Debe abrir caja antes de vender");

    const existing = await this.prisma.salesInvoice.findFirst({
      where: {
        branchId,
        sessionId: session.id,
        tableSessionId: null,
        serviceType,
        status: "draft",
        lines: { none: {} },
      },
      orderBy: { createdAt: "desc" },
      include: this.counterStyleInclude,
    });
    if (existing) return existing;

    return this.prisma.salesInvoice.create({
      data: {
        companyId,
        branchId,
        sessionId: session.id,
        status: "draft",
        serviceType,
      },
      include: this.counterStyleInclude,
    });
  }

  async createCounterSale(branchId: string, companyId: string) {
    return this.getOrCreateEmptyCounterStyleDraft(branchId, companyId, "counter");
  }

  async createTakeawaySale(branchId: string, companyId: string) {
    return this.getOrCreateEmptyCounterStyleDraft(branchId, companyId, "takeaway");
  }

  async createInvoice(branchId: string, companyId: string, dto: CreateInvoiceDto) {
    if (!dto.tableSessionId && (dto.serviceType === "takeaway" || dto.serviceType === "delivery")) {
      return this.getOrCreateEmptyCounterStyleDraft(branchId, companyId, dto.serviceType);
    }

    let tableId: string | null = null;
    let waiterId: string | null = null;
    let guestsCount: number | null = null;

    if (dto.tableSessionId) {
      const ts = await this.prisma.tableSession.findFirst({ where: { id: dto.tableSessionId, branchId } });
      if (!ts || ts.status !== "open") throw new BadRequestException("Invalid table session");
      tableId = ts.tableId;
      waiterId = ts.waiterId;
      guestsCount = ts.guestsCount ?? null;
    }

    const session = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });

    return this.prisma.salesInvoice.create({
      data: {
        companyId,
        branchId,
        sessionId: session?.id ?? null,
        status: "draft",
        serviceType: dto.serviceType,
        tableSessionId: dto.tableSessionId ?? null,
        tableId,
        waiterId,
        guestsCount,
        notes: dto.notes ?? null,
      },
      include: { lines: { include: { modifiers: true } }, payments: true, fiscalDocuments: true },
    });
  }

  async listOpenCounterInvoices(branchId: string) {
    return this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        tableSessionId: null,
        status: { in: ["draft", "sent_to_kitchen"] as any },
        serviceType: { in: ["counter", "takeaway", "delivery"] },
        OR: [{ status: "sent_to_kitchen" }, { lines: { some: {} } }],
      },
      orderBy: { createdAt: "desc" },
      include: {
        lines: { include: { modifiers: true } },
        payments: true,
        fiscalDocuments: true,
      },
    });
  }

  async voidOpenInvoice(branchId: string, invoiceId: string, reason?: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const isCounterStyle =
      !invoice.tableSessionId && ["counter", "takeaway", "delivery"].includes(invoice.serviceType);
    const isTableStyle = !!invoice.tableSessionId && invoice.serviceType === "dine_in";
    if (!isCounterStyle && !isTableStyle) {
      throw new BadRequestException("Tipo de pedido no valido para anular");
    }
    if (!["draft", "sent_to_kitchen"].includes(invoice.status)) {
      throw new BadRequestException("Solo se pueden anular pedidos abiertos");
    }
    if (isTableStyle) {
      const session = await this.prisma.tableSession.findFirst({
        where: { id: invoice.tableSessionId!, branchId },
      });
      if (!session || session.status !== "open") {
        throw new BadRequestException("La sesion de mesa no esta activa");
      }
    }

    await this.kds.cancelInvoiceItems(branchId, invoiceId);

    const noteSuffix = reason ? `[Anulado] ${reason}` : "[Anulado]";
    const notes = invoice.notes ? `${invoice.notes}\n${noteSuffix}` : noteSuffix;
    const wasInKitchen = invoice.status === "sent_to_kitchen";

    const updated = await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { status: "voided", notes, voidedAt: new Date() },
      include: {
        lines: { include: { modifiers: true } },
        payments: true,
        fiscalDocuments: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });

    if (wasInKitchen) {
      this.kds.notifyInvoiceVoided(branchId, {
        invoiceId,
        label: isTableStyle ? this.buildTableOrderLabel(updated) : this.buildCounterOrderLabel(updated),
        reason: reason ?? null,
        serviceType: updated.serviceType,
      });
    }

    let remainingTableInvoices = 0;
    if (isTableStyle && invoice.tableSessionId) {
      remainingTableInvoices = await this.prisma.salesInvoice.count({
        where: {
          branchId,
          tableSessionId: invoice.tableSessionId,
          status: { in: ["draft", "sent_to_kitchen"] as any },
        },
      });
      if (remainingTableInvoices === 0) {
        await this.prisma.tableSession.update({
          where: { id: invoice.tableSessionId },
          data: { status: "closed", closedAt: new Date() },
        });
        this.kds.notifyTableUpdated(branchId, {
          tableSessionId: invoice.tableSessionId,
          tableId: invoice.tableId,
          openInvoices: 0,
          status: "closed",
        });
      }
    }

    return {
      ok: true,
      invoice: updated,
      wasInKitchen,
      remainingTableInvoices,
    };
  }

  /** @deprecated use voidOpenInvoice */
  async voidOpenCounterInvoice(branchId: string, invoiceId: string, reason?: string) {
    return this.voidOpenInvoice(branchId, invoiceId, reason);
  }

  private buildCounterOrderLabel(invoice: {
    serviceType: string;
    pickupCode?: string | null;
    pickupName?: string | null;
    deliveryName?: string | null;
  }) {
    if (invoice.serviceType === "delivery") {
      return `Domicilio · ${invoice.deliveryName ?? "Sin nombre"}`;
    }
    if (invoice.serviceType === "takeaway") {
      const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
      const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
      return `Para llevar${code}${name}`;
    }
    const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
    const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
    return `Mostrador${code}${name}`;
  }

  private buildTableOrderLabel(invoice: {
    tableSession?: { table?: { name: string; area?: { name?: string | null } | null } | null } | null;
  }) {
    const table = invoice.tableSession?.table;
    if (!table) return "Mesa";
    const area = table.area?.name ? `${table.area.name} · ` : "";
    return `${area}Mesa ${table.name}`.trim();
  }

  async voidStaleOpenCounterInvoices(branchId: string, olderThanHours = 4) {
    const hours = Number(olderThanHours);
    if (!Number.isFinite(hours) || hours <= 0) {
      throw new BadRequestException("Horas invalidas");
    }

    const cutoff = new Date(Date.now() - hours * 3600000);
    const stale = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        tableSessionId: null,
        status: { in: ["draft", "sent_to_kitchen"] as any },
        serviceType: { in: ["counter", "takeaway", "delivery"] },
        createdAt: { lt: cutoff },
      },
      orderBy: { createdAt: "asc" },
    });

    const voided: string[] = [];
    const kitchenVoidIds: string[] = [];
    for (const invoice of stale) {
      const result = await this.voidOpenInvoice(
        branchId,
        invoice.id,
        `Anulado automaticamente por antiguedad (+${hours}h)`,
      );
      voided.push(invoice.id);
      if (result.wasInKitchen) kitchenVoidIds.push(invoice.id);
    }

    return { ok: true, voidedCount: voided.length, invoiceIds: voided, kitchenVoidIds, olderThanHours: hours };
  }

  async addLine(branchId: string, invoiceId: string, dto: AddLineDto) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");

    const variant = await this.prisma.productVariant.findUnique({
      where: { id: dto.variantId },
      include: { product: true },
    });

    const qtyNum = Number(dto.qty);
    const unitNum = Number(dto.unitPrice);
    const modifiers = dto.modifiers ?? [];
    const modifiersTotal = modifiers.reduce((s, m) => s + Number(m.priceDelta ?? "0"), 0);
    const grossAmount = qtyNum * unitNum + modifiersTotal;
    const ivaTaxCode = variant?.product.ivaTaxCode ?? "iva_19";
    const consumptionTaxCode = variant?.product.consumptionTaxCode ?? "none";
    const resolved = await this.taxes.resolveRates(invoice.companyId, ivaTaxCode, consumptionTaxCode);
    const { lineSubtotal, lineConsumptionTax, lineTax, lineTotal } = calcLineAmountsFromRates(
      grossAmount,
      resolved.ivaRate,
      resolved.consumptionRate,
    );

    const line = await this.prisma.salesInvoiceLine.create({
      data: {
        invoiceId: invoice.id,
        variantId: dto.variantId,
        nameSnapshot: dto.name ?? variant?.name ?? "Producto",
        course: dto.course ?? variant?.product.course ?? null,
        qty: dto.qty,
        unitPrice: dto.unitPrice,
        weight: dto.weight ?? null,
        lineNotes: dto.lineNotes ?? null,
        ivaTaxCode,
        consumptionTaxCode,
        ivaRateSnapshot: resolved.ivaRate,
        consumptionRateSnapshot: resolved.consumptionRate,
        lineSubtotal: String(lineSubtotal),
        lineConsumptionTax: String(lineConsumptionTax),
        lineTax: String(lineTax),
        lineTotal: String(lineTotal),
        modifiers: {
          create: modifiers.map((m) => ({
            nameSnapshot: m.name,
            priceDeltaSnapshot: m.priceDelta ?? "0",
            notes: m.notes ?? null,
          })),
        },
      },
      include: { modifiers: true },
    });

    await this.recalcInvoiceTotals(invoice.id);

    if (invoice.status === "sent_to_kitchen") {
      const inv = await this.getInvoice(branchId, invoice.id);
      await this.kds.upsertTicketFromInvoice(branchId, inv);
    }

    return line;
  }

  async updatePickup(branchId: string, invoiceId: string, dto: UpdatePickupDto) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (!["counter", "takeaway"].includes(invoice.serviceType)) {
      throw new BadRequestException("Solo aplica a pedidos de mostrador o para llevar");
    }
    if (invoice.status === "paid" || invoice.status === "voided") {
      throw new BadRequestException("Invoice not editable");
    }

    return this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        pickupName: dto.pickupName ?? invoice.pickupName,
        pickupPhone: dto.pickupPhone ?? invoice.pickupPhone,
      },
      include: { lines: { include: { modifiers: true } }, payments: true, fiscalDocuments: true },
    });
  }

  async getPickupNotifyStatus(branchId: string, invoiceId: string) {
    return this.orderNotify.getPickupNotifyStatus(branchId, invoiceId);
  }

  async notifyPickupReady(branchId: string, invoiceId: string) {
    return this.orderNotify.tryNotifyPickupReady(branchId, invoiceId, true);
  }

  async markPickupDelivered(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (!["counter", "takeaway"].includes(invoice.serviceType)) {
      throw new BadRequestException("Solo aplica a pedidos de mostrador o para llevar");
    }

    const served = await this.kds.markInvoiceServed(branchId, invoiceId);
    return {
      ok: true,
      invoiceId,
      updatedItems: served.updated,
    };
  }

  private async nextPickupCode(branchId: string): Promise<string> {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const count = await this.prisma.salesInvoice.count({
      where: {
        branchId,
        serviceType: { in: ["counter", "takeaway"] },
        pickupCode: { not: null },
        createdAt: { gte: start },
      },
    });
    return String((count % 999) + 1).padStart(3, "0");
  }

  async getPickupQueue(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const branchName = branch?.name ?? "Restaurante";

    const tickets = await this.prisma.kdsTicket.findMany({
      where: {
        branchId,
      },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    const invoiceIds = tickets.map((t) => t.invoiceId);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        id: { in: invoiceIds },
        branchId,
        serviceType: { in: ["counter", "takeaway"] },
      },
      include: { lines: true },
    });
    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    const queue: Record<string, unknown>[] = [];
    for (const ticket of tickets) {
      const invoice = invoiceMap.get(ticket.invoiceId);
      if (!invoice) continue;

      const active = ticket.items.filter((i) => i.status !== "canceled");
      if (active.length === 0 || active.every((i) => i.status === "served")) continue;

      const allReady = active.every((i) => i.status === "ready" || i.status === "served");
      const preparing = active.some((i) => i.status === "preparing");
      const kitchenStatus = allReady ? "ready" : preparing ? "preparing" : "new";

      const itemsSummary = active
        .slice(0, 3)
        .map((i) => invoice.lines.find((l) => l.id === i.invoiceLineId)?.nameSnapshot ?? "Producto")
        .join(", ");

      queue.push({
        ticketId: ticket.id,
        invoiceId: ticket.invoiceId,
        pickupCode: invoice.pickupCode,
        pickupName: invoice.pickupName,
        pickupPhone: invoice.pickupPhone,
        serviceType: invoice.serviceType,
        invoiceStatus: invoice.status,
        kitchenStatus,
        itemsSummary,
        pickupNotifiedAt: invoice.pickupNotifiedAt,
        createdAt: ticket.createdAt,
        whatsappLink: buildPickupReadyWhatsAppLink({
          pickupPhone: invoice.pickupPhone,
          customerName: invoice.pickupName,
          branchName,
          itemsSummary,
          invoiceNumber: invoice.invoiceNumber,
          pickupCode: invoice.pickupCode,
        }),
        smsLink: buildPickupReadySmsLink({
          pickupPhone: invoice.pickupPhone,
          customerName: invoice.pickupName,
          branchName,
          itemsSummary,
          invoiceNumber: invoice.invoiceNumber,
          pickupCode: invoice.pickupCode,
        }),
      });
    }

    return queue;
  }

  async getTableReadyQueue(branchId: string) {
    const notificationSettings = await this.getBranchNotificationSettings(branchId);
    const { tableReadyWarnMinutes } = notificationSettings;
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const branchName = branch?.name ?? "Restaurante";
    const now = Date.now();

    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        serviceType: "dine_in",
        status: { in: ["draft", "sent_to_kitchen"] },
        voidedAt: null,
        tableReadyNotifiedAt: { not: null },
        tableReadyServedAt: null,
      },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
      orderBy: { tableReadyNotifiedAt: "asc" },
    });

    const waiters = await this.prisma.staff.findMany({
      where: { branchId, role: "waiter", isActive: true },
      select: { id: true, name: true, phone: true },
    });
    const waiterMap = new Map(waiters.map((w) => [w.id, w]));

    const rows = [];
    for (const invoice of invoices) {
      const table = invoice.tableSession?.table;
      const tableLabel = table
        ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
        : "Mesa";
      const itemsSummary = invoice.lines.slice(0, 3).map((l) => l.nameSnapshot).join(", ");
      const waitingMinutes = Math.max(
        0,
        Math.round((now - new Date(invoice.tableReadyNotifiedAt!).getTime()) / 60000),
      );
      const isOverdue = waitingMinutes >= tableReadyWarnMinutes;

      if (isOverdue) {
        await this.orderNotify.tryNotifyTableOverdue(branchId, invoice.id, waitingMinutes);
      }

      const waiter = invoice.waiterId ? waiterMap.get(invoice.waiterId) : undefined;
      const waiterName = waiter?.name ?? "Mesero";
      const hostWhatsAppLink = isOverdue
        && notificationSettings.tableReadyHostWhatsAppEnabled
        && notificationSettings.hostPhone
        ? buildTableOverdueHostWhatsAppLink({
            hostPhone: notificationSettings.hostPhone,
            branchName,
            tableLabel,
            waiterName,
            waitingMinutes,
            warnAfterMinutes: tableReadyWarnMinutes,
            itemsSummary,
          })
        : null;
      const waiterWhatsAppLink = notificationSettings.tableReadyWaiterWhatsAppEnabled && waiter?.phone
        ? isOverdue
          ? buildTableOverdueWaiterWhatsAppLink({
              waiterPhone: waiter.phone,
              branchName,
              tableLabel,
              waitingMinutes,
              warnAfterMinutes: tableReadyWarnMinutes,
              itemsSummary,
            })
          : buildTableReadyWaiterWhatsAppLink({
              waiterPhone: waiter.phone,
              branchName,
              tableLabel,
              itemsSummary,
            })
        : null;

      rows.push({
        invoiceId: invoice.id,
        tableSessionId: invoice.tableSessionId,
        tableId: invoice.tableId,
        tableLabel,
        itemsSummary,
        total: invoice.total,
        waiterId: invoice.waiterId,
        waiterName,
        readyAt: invoice.tableReadyNotifiedAt,
        status: invoice.status,
        waitingMinutes,
        isOverdue,
        warnAfterMinutes: tableReadyWarnMinutes,
        hostWhatsAppLink,
        waiterWhatsAppLink,
      });
    }

    return rows;
  }

  async getHostBoard(branchId: string) {
    const notificationSettings = await this.getBranchNotificationSettings(branchId);
    const pending = await this.getTableReadyQueue(branchId);

    const byWaiter = new Map<
      string,
      { waiterId: string | null; waiterName: string; tables: typeof pending }
    >();
    for (const row of pending) {
      const key = row.waiterId ?? "unknown";
      const group = byWaiter.get(key) ?? {
        waiterId: row.waiterId ?? null,
        waiterName: row.waiterName,
        tables: [],
      };
      group.tables.push(row);
      byWaiter.set(key, group);
    }

    const pendingByWaiter = [...byWaiter.values()]
      .map((group) => ({
        ...group,
        tables: group.tables.sort(
          (a, b) => new Date(a.readyAt as Date).getTime() - new Date(b.readyAt as Date).getTime(),
        ),
      }))
      .sort((a, b) => b.tables.length - a.tables.length);

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const servedToday = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        serviceType: "dine_in",
        tableReadyNotifiedAt: { not: null },
        tableReadyServedAt: { not: null, gte: todayStart },
      },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
      orderBy: { tableReadyServedAt: "desc" },
      take: 40,
    });

    const waiterIds = [
      ...new Set(
        servedToday.map((i) => i.waiterId).filter((id): id is string => !!id),
      ),
    ];
    const waiterNames = waiterIds.length
      ? await this.prisma.staff.findMany({
          where: { branchId, id: { in: waiterIds } },
          select: { id: true, name: true },
        })
      : [];
    const waiterNameMap = new Map(waiterNames.map((w) => [w.id, w.name]));

    const servedTodayRows = servedToday.map((invoice) => {
      const table = invoice.tableSession?.table;
      const tableLabel = table
        ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
        : "Mesa";
      const readyMs = invoice.tableReadyNotifiedAt!.getTime();
      const servedMs = invoice.tableReadyServedAt!.getTime();

      return {
        invoiceId: invoice.id,
        tableSessionId: invoice.tableSessionId,
        tableLabel,
        waiterName: invoice.waiterId
          ? waiterNameMap.get(invoice.waiterId) ?? "Mesero"
          : "Mesero",
        readyAt: invoice.tableReadyNotifiedAt,
        servedAt: invoice.tableReadyServedAt,
        waitMinutes: Math.max(0, Math.round((servedMs - readyMs) / 60000)),
        itemsSummary: invoice.lines.slice(0, 3).map((l) => l.nameSnapshot).join(", "),
      };
    });

    const waitMinutes = servedTodayRows.map((r) => r.waitMinutes);
    const avgWaitMinutesToday = waitMinutes.length
      ? Math.round(waitMinutes.reduce((a, b) => a + b, 0) / waitMinutes.length)
      : 0;

    const overdueCount = pending.filter((row) => row.isOverdue).length;

    return {
      pendingCount: pending.length,
      overdueCount,
      warnAfterMinutes: notificationSettings.tableReadyWarnMinutes,
      avgWaitMinutesToday,
      longestPendingMinutes: pending.length
        ? Math.max(...pending.map((p) => p.waitingMinutes))
        : 0,
      servedCountToday: servedTodayRows.length,
      pendingByWaiter,
      servedToday: servedTodayRows,
    };
  }

  async markTableServed(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.serviceType !== "dine_in") {
      throw new BadRequestException("Solo aplica a comandas de mesa");
    }
    if (!invoice.tableReadyNotifiedAt) {
      throw new BadRequestException("La comanda aún no está marcada como lista en cocina");
    }
    if (invoice.tableReadyServedAt) {
      return {
        ok: true,
        alreadyServed: true,
        invoiceId,
        tableSessionId: invoice.tableSessionId,
        tableId: invoice.tableId,
      };
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { tableReadyServedAt: new Date() },
    });

    const served = await this.kds.markInvoiceServed(branchId, invoiceId);
    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mesa";

    const payload = {
      invoiceId,
      tableSessionId: invoice.tableSessionId,
      tableId: invoice.tableId,
      tableLabel,
    };
    this.kds.notifyTableServed(branchId, payload);

    return {
      ok: true,
      invoiceId,
      tableSessionId: invoice.tableSessionId,
      tableId: invoice.tableId,
      tableLabel,
      updatedItems: served.updated,
    };
  }

  async getDeliveryQueue(branchId: string) {
    const tickets = await this.prisma.kdsTicket.findMany({
      where: { branchId },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    const invoiceIds = tickets.map((t) => t.invoiceId);
    const invoices = await this.prisma.salesInvoice.findMany({
      where: {
        id: { in: invoiceIds },
        branchId,
        serviceType: "delivery",
      },
      include: { lines: true },
      orderBy: { createdAt: "asc" },
    });
    const invoiceMap = new Map(invoices.map((inv) => [inv.id, inv]));

    return tickets
      .map((ticket) => {
        const invoice = invoiceMap.get(ticket.invoiceId);
        if (!invoice) return null;

        const active = ticket.items.filter((i) => i.status !== "canceled");
        const allReady = active.length > 0 && active.every((i) => i.status === "ready" || i.status === "served");
        const preparing = active.some((i) => i.status === "preparing");
        const kitchenStatus = allReady ? "ready" : preparing ? "preparing" : "new";
        const deliveryStatus =
          invoice.deliveryStatus ??
          (invoice.status === "paid"
            ? "pending"
            : kitchenStatus === "ready"
              ? "pending"
              : kitchenStatus === "preparing"
                ? "in_kitchen"
                : "new");

        return {
          ticketId: ticket.id,
          invoiceId: invoice.id,
          customerName: invoice.deliveryName,
          customerPhone: invoice.deliveryPhone,
          deliveryAddress: invoice.deliveryAddress,
          deliveryReference: invoice.deliveryReference,
          deliveryFee: invoice.deliveryFee,
          total: invoice.total,
          invoiceStatus: invoice.status,
          kitchenStatus,
          deliveryStatus,
          itemsSummary: invoice.lines.slice(0, 3).map((l) => l.nameSnapshot).join(", "),
          createdAt: invoice.createdAt,
        };
      })
      .filter(Boolean);
  }

  async updateDeliveryStatus(branchId: string, invoiceId: string, status: string) {
    const allowed = new Set(["new", "in_kitchen", "pending", "on_route", "delivered"]);
    if (!allowed.has(status)) throw new BadRequestException("Estado de domicilio invalido");

    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.serviceType !== "delivery") throw new BadRequestException("Solo aplica a domicilios");

    const updated = await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { deliveryStatus: status },
    });

    if (status === "delivered") {
      await this.kds.markInvoiceServed(branchId, invoiceId);
    }

    return updated;
  }

  async updateDelivery(branchId: string, invoiceId: string, dto: UpdateDeliveryDto) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.serviceType !== "delivery") throw new BadRequestException("Not a delivery invoice");

    return this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        deliveryName: dto.deliveryName ?? invoice.deliveryName,
        deliveryPhone: dto.deliveryPhone ?? invoice.deliveryPhone,
        deliveryAddress: dto.deliveryAddress ?? invoice.deliveryAddress,
        deliveryReference: dto.deliveryReference ?? invoice.deliveryReference,
        deliveryFee: dto.deliveryFee ?? invoice.deliveryFee,
        deliveryStatus: invoice.deliveryStatus ?? "new",
      },
    });
  }

  async sendToKitchen(branchId: string, invoiceId: string) {
    const invoice = await this.getInvoice(branchId, invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invalid invoice status");
    if (invoice.lines.length === 0) throw new BadRequestException("Invoice has no lines");

    const alreadySent = invoice.status === "sent_to_kitchen";
    const needsCode =
      ["counter", "takeaway"].includes(invoice.serviceType) && !invoice.pickupCode;
    const pickupCode = needsCode ? await this.nextPickupCode(branchId) : undefined;

    const updated = await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        ...(alreadySent ? {} : { status: "sent_to_kitchen" }),
        ...(pickupCode ? { pickupCode } : {}),
        ...(invoice.serviceType === "delivery" ? { deliveryStatus: "in_kitchen" } : {}),
      },
      include: { lines: { include: { modifiers: true } }, payments: true, fiscalDocuments: true },
    });

    await this.kds.upsertTicketFromInvoice(branchId, updated);
    return updated;
  }

  async removeLine(branchId: string, invoiceId: string, lineId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");

    const line = await this.prisma.salesInvoiceLine.findFirst({ where: { id: lineId, invoiceId } });
    if (!line) throw new NotFoundException("Line not found");

    await this.prisma.kdsItem.deleteMany({ where: { invoiceLineId: lineId } });
    await this.prisma.salesLineModifier.deleteMany({ where: { invoiceLineId: lineId } });
    await this.prisma.salesInvoiceLine.delete({ where: { id: lineId } });
    await this.recalcInvoiceTotals(invoiceId);

    return this.getInvoice(branchId, invoiceId);
  }

  async updateLineQty(branchId: string, invoiceId: string, lineId: string, qty: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");
    if (invoice.status === "sent_to_kitchen") {
      throw new BadRequestException("No se puede cambiar cantidad despues de enviar a cocina");
    }

    const line = await this.prisma.salesInvoiceLine.findFirst({
      where: { id: lineId, invoiceId },
      include: { modifiers: true },
    });
    if (!line) throw new NotFoundException("Line not found");

    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      throw new BadRequestException("Cantidad invalida");
    }

    const modifiersTotal = line.modifiers.reduce((sum, mod) => sum + Number(mod.priceDeltaSnapshot ?? "0"), 0);
    const unitNum = Number(line.unitPrice);
    const grossAmount = qtyNum * unitNum + modifiersTotal;
    let ivaRate = line.ivaRateSnapshot != null ? Number(line.ivaRateSnapshot) : undefined;
    let consumptionRate = line.consumptionRateSnapshot != null ? Number(line.consumptionRateSnapshot) : undefined;
    if (ivaRate == null || consumptionRate == null) {
      const resolved = await this.taxes.resolveRates(invoice.companyId, line.ivaTaxCode, line.consumptionTaxCode);
      ivaRate = ivaRate ?? resolved.ivaRate;
      consumptionRate = consumptionRate ?? resolved.consumptionRate;
    }
    const { lineSubtotal, lineConsumptionTax, lineTax, lineTotal } = calcLineAmountsFromRates(
      grossAmount,
      ivaRate,
      consumptionRate,
    );

    await this.prisma.salesInvoiceLine.update({
      where: { id: lineId },
      data: {
        qty,
        lineSubtotal: String(lineSubtotal),
        lineConsumptionTax: String(lineConsumptionTax),
        lineTax: String(lineTax),
        lineTotal: String(lineTotal),
      },
    });

    await this.recalcInvoiceTotals(invoiceId);
    return this.getInvoice(branchId, invoiceId);
  }

  async updateLineNote(branchId: string, invoiceId: string, lineId: string, lineNotes: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");
    if (invoice.status === "sent_to_kitchen") {
      throw new BadRequestException("No se puede cambiar la nota despues de enviar a cocina");
    }

    const line = await this.prisma.salesInvoiceLine.findFirst({ where: { id: lineId, invoiceId } });
    if (!line) throw new NotFoundException("Line not found");

    await this.prisma.salesInvoiceLine.update({
      where: { id: lineId },
      data: { lineNotes: lineNotes.trim() || null },
    });

    return this.getInvoice(branchId, invoiceId);
  }

  async splitInvoice(branchId: string, invoiceId: string, lineIds: string[]) {
    const invoice = await this.getInvoice(branchId, invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (!invoice.tableSessionId) throw new BadRequestException("Solo aplica a comandas de mesa");
    if (invoice.status === "paid" || invoice.status === "voided") {
      throw new BadRequestException("Invoice not editable");
    }

    const uniqueIds = [...new Set(lineIds)];
    const linesToMove = invoice.lines.filter((l) => uniqueIds.includes(l.id));
    if (linesToMove.length === 0) throw new BadRequestException("Selecciona al menos un ítem");
    if (linesToMove.length >= invoice.lines.length) {
      throw new BadRequestException("Debe quedar al menos un ítem en la cuenta original");
    }

    const openSession = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });

    const splitInvoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.salesInvoice.create({
        data: {
          companyId: invoice.companyId,
          branchId,
          sessionId: invoice.sessionId ?? openSession?.id ?? null,
          status: invoice.status,
          serviceType: invoice.serviceType,
          tableSessionId: invoice.tableSessionId,
          tableId: invoice.tableId,
          waiterId: invoice.waiterId,
          guestsCount: invoice.guestsCount,
        },
      });

      await tx.salesInvoiceLine.updateMany({
        where: { id: { in: linesToMove.map((l) => l.id) }, invoiceId: invoice.id },
        data: { invoiceId: created.id },
      });

      const movedKdsItems = await tx.kdsItem.findMany({
        where: { invoiceLineId: { in: linesToMove.map((l) => l.id) } },
      });

      if (movedKdsItems.length) {
        let ticket = await tx.kdsTicket.findFirst({ where: { branchId, invoiceId: created.id } });
        if (!ticket) {
          ticket = await tx.kdsTicket.create({
            data: {
              branchId,
              invoiceId: created.id,
              status: "new",
              tableId: invoice.tableId,
              waiterId: invoice.waiterId,
            },
          });
        }
        await tx.kdsItem.updateMany({
          where: { id: { in: movedKdsItems.map((i) => i.id) } },
          data: { ticketId: ticket.id },
        });
      }

      return created;
    });

    await this.recalcInvoiceTotals(invoice.id);
    await this.recalcInvoiceTotals(splitInvoice.id);

    return {
      original: await this.getInvoice(branchId, invoice.id),
      split: await this.getInvoice(branchId, splitInvoice.id),
    };
  }

  async pay(branchId: string, invoiceId: string, dto: PayInvoiceDto) {
    const invoice = await this.getInvoice(branchId, invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid") throw new BadRequestException("Already paid");
    if (invoice.lines.length === 0) throw new BadRequestException("Invoice has no lines");

    const totalWithTip = Number(invoice.total) + Number(dto.tipAmount ?? 0);
    const totalPaid = dto.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (totalPaid < totalWithTip) throw new BadRequestException("Insufficient payment");

    const openSession = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });
    if (!openSession) throw new BadRequestException("Debe abrir caja antes de cobrar");

    let closedTableSession: { tableSessionId: string; tableId: string | null } | null = null;

    const paidInvoice = await this.prisma.$transaction(async (tx: any) => {
      await tx.payment.createMany({
        data: dto.payments.map((p) => ({
          invoiceId: invoice.id,
          method: p.method,
          amount: p.amount,
          reference: p.reference ?? null,
          tipAmount: p.tipAmount ?? 0,
        })),
      });

      const inv = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          tipAmount: dto.tipAmount ?? 0,
          sessionId: invoice.sessionId ?? openSession.id,
        },
        include: { lines: { include: { modifiers: true } }, payments: true, fiscalDocuments: true },
      });

      await this.deductStock(tx, branchId, inv.lines);

      let closed: { tableSessionId: string; tableId: string | null } | null = null;
      if (invoice.tableSessionId) {
        const remaining = await tx.salesInvoice.count({
          where: {
            tableSessionId: invoice.tableSessionId,
            status: { in: ["draft", "sent_to_kitchen"] },
            id: { not: invoice.id },
          },
        });
        if (remaining === 0) {
          await tx.tableSession.update({
            where: { id: invoice.tableSessionId },
            data: { status: "closed", closedAt: new Date() },
          });
          closed = {
            tableSessionId: invoice.tableSessionId,
            tableId: invoice.tableId,
          };
        }
      }

      return { inv, closedTableSession: closed };
    });

    this.kds.notifyInvoicePaid(branchId, paidInvoice.inv.id);
    closedTableSession = paidInvoice.closedTableSession;

    if (closedTableSession) {
      this.kds.notifyTableUpdated(branchId, {
        tableSessionId: closedTableSession.tableSessionId,
        tableId: closedTableSession.tableId,
        openInvoices: 0,
        status: "closed",
      });
    }

    let fiscalDoc = null;
    try {
      fiscalDoc = await this.fiscal.issuePosEquivalent(invoice.companyId, invoice.id);
    } catch (err: any) {
      // Venta pagada aunque falle emisión — queda en contingencia
    }

    return { ...paidInvoice.inv, fiscalDocument: fiscalDoc };
  }

  async getInvoice(branchId: string, invoiceId: string) {
    return this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: { include: { modifiers: true } },
        payments: true,
        fiscalDocuments: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
  }

  private async deductStock(tx: any, branchId: string, lines: any[]) {
    const warehouse = await tx.warehouse.findFirst({ where: { branchId, isDefault: true } });
    if (!warehouse) return;

    for (const line of lines) {
      const variant = await tx.productVariant.findUnique({
        where: { id: line.variantId },
        include: {
          product: {
            include: {
              recipeLines: { orderBy: { sortOrder: "asc" } },
            },
          },
        },
      });
      if (!variant) continue;

      const soldQty = Number(line.qty);
      if (variant.product.recipeLines.length > 0) {
        for (const recipeLine of variant.product.recipeLines) {
          const deductQty = Number(recipeLine.quantity) * soldQty;
          await this.adjustStockLevel(
            tx,
            warehouse.id,
            recipeLine.ingredientVariantId,
            deductQty,
            line.invoiceId,
            "sale",
          );
        }
        continue;
      }

      if (variant.product.isIngredient) continue;

      await this.adjustStockLevel(tx, warehouse.id, line.variantId, soldQty, line.invoiceId, "sale");
    }
  }

  private async adjustStockLevel(
    tx: any,
    warehouseId: string,
    variantId: string,
    qty: number,
    reference: string,
    type: "sale" | "production",
  ) {
    const stock = await tx.stockLevel.findUnique({
      where: { warehouseId_variantId: { warehouseId, variantId } },
    });
    if (!stock) return;

    await tx.stockLevel.update({
      where: { id: stock.id },
      data: { quantity: { decrement: qty } },
    });

    await tx.stockMovement.create({
      data: {
        warehouseId,
        variantId,
        type,
        quantity: qty,
        reference,
      },
    });
  }

  private async recalcInvoiceTotals(invoiceId: string) {
    const lines = await this.prisma.salesInvoiceLine.findMany({ where: { invoiceId } });
    const subtotal = lines.reduce((sum: number, l: any) => sum + Number(l.lineSubtotal), 0);
    const consumptionTax = lines.reduce((sum: number, l: any) => sum + Number(l.lineConsumptionTax), 0);
    const tax = lines.reduce((sum: number, l: any) => sum + Number(l.lineTax), 0);
    const total = lines.reduce((sum: number, l: any) => sum + Number(l.lineTotal), 0);

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: String(subtotal),
        consumptionTax: String(consumptionTax),
        tax: String(tax),
        total: String(total),
      },
    });
  }
}
