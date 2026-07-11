import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { AddLineDto } from "./dto/add-line.dto";
import { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import { UpdatePickupDto } from "./dto/update-pickup.dto";
import { PayInvoiceDto, TerminalPaymentResultDto } from "./dto/pay-invoice.dto";
import { ApplyInvoiceDiscountDto, ApplyLineDiscountDto } from "./dto/apply-discount.dto";
import { KdsService } from "../kds/kds.service";
import { FiscalService } from "../fiscal/fiscal.service";
import { OrderNotifyService } from "../notifications/order-notify.service";
import {
  normalizePhysicalLocatorCode,
  AUTO_ORDER_CODE_MAX,
  AUTO_ORDER_CODE_START,
  parsePickupCodeNumber,
} from "./pickup-code.util";
import {
  releaseStalePickupLocatorsForCode,
  sweepReleasedPickupLocators,
} from "./pickup-locator.helper";
import {
  buildPickupReadySmsLink,
  buildPickupReadyWhatsAppLink,
  buildTableOverdueHostWhatsAppLink,
  buildTableOverdueWaiterWhatsAppLink,
  buildTableReadyWaiterWhatsAppLink,
} from "../restaurant/reservation-notify.util";
import { readBranchNotificationSettings } from "../settings/branch-notifications.util";
import {
  discountPercentRequiresApproval,
  readBranchPosSettings,
  verifyElevatedApproval,
} from "../settings/branch-pos.util";
import { calcLineAmountsFromRates } from "../common/tax.util";
import { TaxDefinitionService } from "../tax/tax-definition.service";
import { ReceiptService } from "../print/receipt.service";
import { CustomersService } from "../customers/customers.service";

@Injectable()
export class PosService {
  constructor(
    private prisma: PrismaService,
    private kds: KdsService,
    private fiscal: FiscalService,
    private orderNotify: OrderNotifyService,
    private taxes: TaxDefinitionService,
    private receipts: ReceiptService,
    private customers: CustomersService,
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

    const invoices = await this.prisma.salesInvoice.findMany({
      where: { branchId, tableSessionId, status: { in: ["draft", "sent_to_kitchen"] as any } },
      orderBy: { createdAt: "asc" },
      include: {
        lines: { include: { modifiers: true } },
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    return Promise.all(invoices.map((invoice) => this.enrichInvoiceWithKitchenStatus(invoice)));
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
      if (selected.waiterId !== ts.waiterId || selected.waiterUserId !== ts.waiterUserId) {
        const updated = await this.prisma.salesInvoice.update({
          where: { id: selected.id },
          data: { waiterId: ts.waiterId, waiterUserId: ts.waiterUserId },
          include: invoiceInclude,
        });
        return this.enrichInvoiceWithKitchenStatus(updated);
      }
      return this.enrichInvoiceWithKitchenStatus(selected);
    }

    const existing = await this.prisma.salesInvoice.findFirst({
      where: { branchId, tableSessionId, status: { in: ["draft", "sent_to_kitchen"] as any } },
      orderBy: { createdAt: "desc" },
      include: invoiceInclude,
    });

    if (existing) {
      if (existing.waiterId !== ts.waiterId || existing.waiterUserId !== ts.waiterUserId) {
        const updated = await this.prisma.salesInvoice.update({
          where: { id: existing.id },
          data: { waiterId: ts.waiterId, waiterUserId: ts.waiterUserId },
          include: invoiceInclude,
        });
        return this.enrichInvoiceWithKitchenStatus(updated);
      }
      return this.enrichInvoiceWithKitchenStatus(existing);
    }

    const created = await this.prisma.salesInvoice.create({
      data: {
        companyId,
        branchId,
        sessionId: openSession?.id ?? null,
        status: "draft",
        serviceType: "dine_in",
        tableSessionId,
        tableId: ts.tableId,
        waiterId: ts.waiterId,
        waiterUserId: ts.waiterUserId,
        guestsCount: ts.guestsCount ?? null,
      },
      include: invoiceInclude,
    });
    return this.enrichInvoiceWithKitchenStatus(created);
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
    let waiterUserId: string | null = null;
    let guestsCount: number | null = null;

    if (dto.tableSessionId) {
      const ts = await this.prisma.tableSession.findFirst({ where: { id: dto.tableSessionId, branchId } });
      if (!ts || ts.status !== "open") throw new BadRequestException("Invalid table session");
      tableId = ts.tableId;
      waiterId = ts.waiterId;
      waiterUserId = ts.waiterUserId;
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
        waiterUserId,
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

  async voidOpenInvoice(
    branchId: string,
    invoiceId: string,
    opts?: { reason?: string; approvalPin?: string; approvalTotp?: string; skipApproval?: boolean },
  ) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");

    const posSettings = await readBranchPosSettings(this.prisma, branchId);
    if (posSettings.requireApprovalVoidInvoice && !opts?.skipApproval) {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { company: { select: { tenantId: true } } },
      });
      if (!branch) throw new NotFoundException("Branch not found");
      if (!opts?.approvalPin?.trim() && !opts?.approvalTotp?.trim()) {
        throw new ForbiddenException({
          code: "APPROVAL_REQUIRED",
          message: "Anular comanda requiere PIN de gerente o autenticador",
          action: "void_invoice",
        });
      }
      const approval = await verifyElevatedApproval(
        this.prisma,
        branchId,
        branch.company.tenantId,
        { approvalPin: opts?.approvalPin, approvalTotp: opts?.approvalTotp },
      );
      opts = {
        ...opts,
        reason: opts?.reason
          ? `${opts.reason} · Autorizado: ${approval.approverName}`
          : `Autorizado: ${approval.approverName}`,
      };
    }

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

    const reason = opts?.reason;
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
    return this.voidOpenInvoice(branchId, invoiceId, { reason });
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
      const result = await this.voidOpenInvoice(branchId, invoice.id, {
        reason: `Anulado automaticamente por antiguedad (+${hours}h)`,
        skipApproval: true,
      });
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

    const posSettings = await readBranchPosSettings(this.prisma, branchId);
    if (posSettings.kitchenSendMode === "auto") {
      // En modo auto, cada producto nuevo se empuja a cocina (primera vez o adicionales).
      await this.sendToKitchen(branchId, invoice.id);
    }
    // En modo manual no se envía al KDS hasta "Enviar a cocina" (aunque la cuenta ya esté en cocina).

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

    let pickupCode: string | null | undefined;
    if (dto.pickupCode !== undefined) {
      const trimmed = dto.pickupCode.trim();
      if (!trimmed) {
        pickupCode = null;
      } else {
        pickupCode = normalizePhysicalLocatorCode(trimmed);
        await this.assertPickupCodeAvailable(branchId, pickupCode, invoiceId);
      }
    }

    return this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        pickupName: dto.pickupName ?? invoice.pickupName,
        pickupPhone: dto.pickupPhone ?? invoice.pickupPhone,
        ...(pickupCode !== undefined ? { pickupCode } : {}),
      },
      include: { lines: { include: { modifiers: true } }, payments: true, fiscalDocuments: true },
    });
  }

  private async nextAutoOrderCode(branchId: string): Promise<string> {
    await sweepReleasedPickupLocators(this.prisma, branchId);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const taken = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        serviceType: { in: ["counter", "takeaway"] },
        pickupCode: { not: null },
        pickupDeliveredAt: null,
        voidedAt: null,
        status: { in: ["draft", "sent_to_kitchen", "paid"] },
        createdAt: { gte: start },
      },
      select: { pickupCode: true },
    });

    const usedAuto = new Set<number>();
    for (const row of taken) {
      const n = parsePickupCodeNumber(row.pickupCode);
      if (n != null && n >= AUTO_ORDER_CODE_START) usedAuto.add(n);
    }

    for (let n = AUTO_ORDER_CODE_START; n <= AUTO_ORDER_CODE_MAX; n++) {
      if (!usedAuto.has(n)) return String(n);
    }
    return String(AUTO_ORDER_CODE_START);
  }

  private activePickupInvoiceWhere(branchId: string): Prisma.SalesInvoiceWhereInput {
    return {
      branchId,
      serviceType: { in: ["counter", "takeaway"] },
      voidedAt: null,
      pickupDeliveredAt: null,
      lines: { some: {} },
      OR: [
        { status: "sent_to_kitchen" },
        {
          pickupCode: { not: null },
          status: { in: ["draft", "sent_to_kitchen", "paid"] },
        },
      ],
    };
  }

  private derivePickupKitchenStatus(
    invoice: { status: string },
    activeKdsItems: Array<{ status: string }>,
  ): "new" | "preparing" | "ready" {
    if (activeKdsItems.length > 0) {
      const allReady = activeKdsItems.every((i) => i.status === "ready" || i.status === "served");
      const preparing = activeKdsItems.some((i) => i.status === "preparing");
      return allReady ? "ready" : preparing ? "preparing" : "new";
    }
    if (invoice.status === "paid") return "ready";
    return "new";
  }

  private async assertPickupCodeAvailable(branchId: string, pickupCode: string, excludeInvoiceId: string) {
    await releaseStalePickupLocatorsForCode(this.prisma, branchId, pickupCode, excludeInvoiceId);

    const taken = await this.prisma.salesInvoice.findFirst({
      where: {
        branchId,
        id: { not: excludeInvoiceId },
        pickupCode,
        voidedAt: null,
        pickupDeliveredAt: null,
        serviceType: { in: ["counter", "takeaway"] },
        status: { in: ["draft", "sent_to_kitchen", "paid"] },
      },
      select: { id: true },
    });
    if (taken) {
      throw new BadRequestException(`El localizador #${pickupCode} ya está en uso en un pedido activo`);
    }
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
    if (invoice.pickupDeliveredAt) {
      return { ok: true, invoiceId, updatedItems: 0, alreadyDelivered: true };
    }

    const served = await this.kds.markInvoiceServed(branchId, invoiceId);
    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { pickupDeliveredAt: new Date() },
    });
    return {
      ok: true,
      invoiceId,
      updatedItems: served.updated,
    };
  }

  async getPickupQueue(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const branchName = branch?.name ?? "Restaurante";

    const invoices = await this.prisma.salesInvoice.findMany({
      where: this.activePickupInvoiceWhere(branchId),
      include: { lines: true },
      orderBy: { createdAt: "asc" },
    });
    if (invoices.length === 0) return [];

    const tickets = await this.prisma.kdsTicket.findMany({
      where: { branchId, invoiceId: { in: invoices.map((inv) => inv.id) } },
      include: { items: true },
    });
    const ticketByInvoice = new Map(tickets.map((ticket) => [ticket.invoiceId, ticket]));

    const queue: Record<string, unknown>[] = [];
    for (const invoice of invoices) {
      const ticket = ticketByInvoice.get(invoice.id);
      const active = (ticket?.items ?? []).filter((i) => i.status !== "canceled");
      if (active.length > 0 && active.every((i) => i.status === "served")) continue;

      const kitchenStatus = this.derivePickupKitchenStatus(invoice, active);
      const itemsSummary =
        active.length > 0
          ? active
              .slice(0, 3)
              .map((i) => invoice.lines.find((l) => l.id === i.invoiceLineId)?.nameSnapshot ?? "Producto")
              .join(", ")
          : invoice.lines
              .slice(0, 3)
              .map((line) => line.nameSnapshot)
              .join(", ");

      queue.push({
        ticketId: ticket?.id ?? invoice.id,
        invoiceId: invoice.id,
        pickupCode: invoice.pickupCode,
        pickupName: invoice.pickupName,
        pickupPhone: invoice.pickupPhone,
        serviceType: invoice.serviceType,
        invoiceStatus: invoice.status,
        kitchenStatus,
        itemsSummary,
        pickupNotifiedAt: invoice.pickupNotifiedAt,
        createdAt: ticket?.createdAt ?? invoice.createdAt,
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

    const userIds = [...new Set(invoices.map((i) => i.waiterUserId).filter((id): id is string => !!id))];
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true },
        })
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

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

      const staffWaiter = invoice.waiterId ? waiterMap.get(invoice.waiterId) : undefined;
      const userWaiter = invoice.waiterUserId ? userMap.get(invoice.waiterUserId) : undefined;
      const waiterName = staffWaiter?.name ?? userWaiter?.name ?? "Mesero";
      const waiterPhone = staffWaiter?.phone ?? null;
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
      const waiterWhatsAppLink = notificationSettings.tableReadyWaiterWhatsAppEnabled && waiterPhone
        ? isOverdue
          ? buildTableOverdueWaiterWhatsAppLink({
              waiterPhone,
              branchName,
              tableLabel,
              waitingMinutes,
              warnAfterMinutes: tableReadyWarnMinutes,
              itemsSummary,
            })
          : buildTableReadyWaiterWhatsAppLink({
              waiterPhone,
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
        serviceType: invoice.serviceType,
        waiterId: invoice.waiterId,
        waiterUserId: invoice.waiterUserId,
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
    const pickupCode = needsCode ? await this.nextAutoOrderCode(branchId) : undefined;

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
    return this.getInvoice(branchId, invoiceId);
  }

  async removeLine(
    branchId: string,
    invoiceId: string,
    lineId: string,
    options: {
      actor: "waiter" | "kitchen";
      approvalPin?: string;
      approvalTotp?: string;
    } = { actor: "waiter" },
  ) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");

    const line = await this.prisma.salesInvoiceLine.findFirst({
      where: { id: lineId, invoiceId },
      include: { modifiers: true },
    });
    if (!line) throw new NotFoundException("Line not found");

    const posSettings = await readBranchPosSettings(this.prisma, branchId);
    if (posSettings.requireApprovalVoidLine && options.actor === "waiter") {
      const branch = await this.prisma.branch.findUnique({
        where: { id: branchId },
        select: { company: { select: { tenantId: true } } },
      });
      if (!branch) throw new NotFoundException("Branch not found");
      if (!options.approvalPin?.trim() && !options.approvalTotp?.trim()) {
        throw new ForbiddenException({
          code: "APPROVAL_REQUIRED",
          message: "Eliminar producto requiere PIN de gerente o autenticador",
          action: "void_line",
        });
      }
      await verifyElevatedApproval(this.prisma, branchId, branch.company.tenantId, {
        approvalPin: options.approvalPin,
        approvalTotp: options.approvalTotp,
      });
    }

    const kdsItems = await this.prisma.kdsItem.findMany({
      where: {
        invoiceLineId: lineId,
        ticket: { branchId, invoiceId },
      },
    });
    const activeItems = kdsItems.filter((item) => item.status !== "canceled");
    const blockedForWaiter = activeItems.some((item) =>
      ["preparing", "ready", "served"].includes(item.status),
    );
    if (options.actor === "waiter" && blockedForWaiter) {
      throw new BadRequestException("Este producto ya está en preparación. Solo cocina puede anularlo.");
    }
    if (options.actor === "kitchen" && activeItems.some((item) => item.status === "served")) {
      throw new BadRequestException("Este producto ya fue entregado y no se puede anular.");
    }

    const wasInKitchen = invoice.status === "sent_to_kitchen";
    let kitchenLineVoidEscpos: { base64: string; bytes: number } | null = null;

    if (wasInKitchen && activeItems.length > 0) {
      const canceled = await this.kds.cancelLineItems(branchId, invoiceId, lineId);
      if (canceled.updated > 0) {
        kitchenLineVoidEscpos = await this.receipts.getKitchenLineVoidEscPosBase64(branchId, invoiceId, {
          qty: String(line.qty),
          name: line.nameSnapshot,
          modifiers: line.modifiers.map((m) => m.nameSnapshot),
          notes: line.lineNotes ?? undefined,
        });
      }
    }

    await this.prisma.kdsItem.deleteMany({ where: { invoiceLineId: lineId } });
    await this.prisma.salesLineModifier.deleteMany({ where: { invoiceLineId: lineId } });
    await this.prisma.salesInvoiceLine.delete({ where: { id: lineId } });
    await this.recalcInvoiceTotals(invoiceId);

    if (wasInKitchen) {
      const label = invoice.tableSessionId
        ? this.buildTableOrderLabel(invoice)
        : this.buildCounterOrderLabel(invoice);
      this.kds.notifyLineVoided(branchId, {
        invoiceId,
        lineId,
        tableSessionId: invoice.tableSessionId,
        tableId: invoice.tableId,
        serviceType: invoice.serviceType,
        label,
        productName: line.nameSnapshot,
        qty: Number(line.qty),
        actor: options.actor,
      });
    }

    const updated = await this.getInvoice(branchId, invoiceId);
    return { ...updated, kitchenLineVoidEscpos };
  }

  async updateLineQty(branchId: string, invoiceId: string, lineId: string, qty: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");

    const line = await this.prisma.salesInvoiceLine.findFirst({
      where: { id: lineId, invoiceId },
      include: { modifiers: true },
    });
    if (!line) throw new NotFoundException("Line not found");

    const activeKds = await this.prisma.kdsItem.findFirst({
      where: {
        invoiceLineId: lineId,
        ticket: { branchId, invoiceId },
        status: { not: "canceled" },
      },
    });
    if (activeKds) {
      throw new BadRequestException("No se puede cambiar cantidad de un producto ya enviado a cocina");
    }

    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      throw new BadRequestException("Cantidad invalida");
    }

    const modifiersTotal = line.modifiers.reduce((sum, mod) => sum + Number(mod.priceDeltaSnapshot ?? "0"), 0);
    const previousGross = Number(line.qty) * Number(line.unitPrice) + modifiersTotal;

    await this.prisma.salesInvoiceLine.update({
      where: { id: lineId },
      data: { qty },
    });

    await this.recalcLineTotals(lineId, invoice.companyId, previousGross);
    await this.recalcInvoiceTotals(invoiceId);
    return this.getInvoice(branchId, invoiceId);
  }

  async applyLineDiscount(branchId: string, invoiceId: string, lineId: string, dto: ApplyLineDiscountDto) {
    const invoice = await this.assertInvoiceEditable(branchId, invoiceId);
    const line = await this.prisma.salesInvoiceLine.findFirst({
      where: { id: lineId, invoiceId },
      include: { modifiers: true },
    });
    if (!line) throw new NotFoundException("Line not found");

    const gross = this.lineGrossAmount(line);
    let lineDiscount = 0;
    let discountPercent = 0;
    if (dto.kind === "courtesy") {
      lineDiscount = gross;
      discountPercent = gross > 0 ? 100 : 0;
    } else if (dto.kind === "percent") {
      const pct = Number(dto.value);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException("Porcentaje invalido (0-100)");
      }
      discountPercent = pct;
      lineDiscount = Math.round(gross * pct / 100);
    } else if (dto.kind === "amount") {
      lineDiscount = Number(dto.value);
      if (!Number.isFinite(lineDiscount) || lineDiscount < 0) {
        throw new BadRequestException("Monto de descuento invalido");
      }
      discountPercent = gross > 0 ? (lineDiscount / gross) * 100 : 0;
    }

    if (dto.kind !== "clear") {
      await this.assertDiscountApproved(branchId, discountPercent, {
        approvalPin: dto.approvalPin,
        approvalTotp: dto.approvalTotp,
      });
    }

    lineDiscount = Math.min(Math.max(0, Math.round(lineDiscount)), gross);

    const noteSuffix = dto.reason?.trim()
      ? dto.reason.trim()
      : dto.kind === "courtesy"
        ? "Cortesia"
        : null;
    let lineNotes = line.lineNotes;
    if (dto.kind === "clear") {
      lineNotes = line.lineNotes?.replace(/^\[Cortesia\]\s*/i, "").trim() || null;
    } else if (noteSuffix && dto.kind === "courtesy") {
      const base = line.lineNotes?.replace(/^\[Cortesia\]\s*/i, "").trim();
      lineNotes = base ? `[Cortesia] ${noteSuffix} · ${base}` : `[Cortesia] ${noteSuffix}`;
    }

    await this.prisma.salesInvoiceLine.update({
      where: { id: lineId },
      data: {
        lineDiscount: String(lineDiscount),
        lineNotes,
      },
    });

    await this.recalcLineTotals(lineId, invoice.companyId);
    await this.recalcInvoiceTotals(invoiceId);
    const updated = await this.getInvoice(branchId, invoiceId);
    this.notifyInvoiceDiscountChange(branchId, invoice, "line-discount", {
      lineId,
      productName: line.nameSnapshot,
    });
    return updated;
  }

  async applyInvoiceDiscount(branchId: string, invoiceId: string, dto: ApplyInvoiceDiscountDto) {
    const invoice = await this.assertInvoiceEditable(branchId, invoiceId);

    const lines = await this.prisma.salesInvoiceLine.findMany({ where: { invoiceId } });
    const linesTotal = lines.reduce((sum, line) => sum + Number(line.lineTotal), 0);

    let discount = 0;
    let discountPercent = 0;
    if (dto.kind === "percent") {
      const pct = Number(dto.value);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
        throw new BadRequestException("Porcentaje invalido (0-100)");
      }
      discountPercent = pct;
      discount = Math.round(linesTotal * pct / 100);
    } else if (dto.kind === "amount") {
      discount = Number(dto.value);
      if (!Number.isFinite(discount) || discount < 0) {
        throw new BadRequestException("Monto de descuento invalido");
      }
      discountPercent = linesTotal > 0 ? (discount / linesTotal) * 100 : 0;
    }

    if (dto.kind !== "clear") {
      await this.assertDiscountApproved(branchId, discountPercent, {
        approvalPin: dto.approvalPin,
        approvalTotp: dto.approvalTotp,
      });
    }

    discount = Math.min(Math.max(0, Math.round(discount)), linesTotal);

    let notes = invoice.notes;
    if (dto.kind === "clear") {
      notes = invoice.notes?.split("\n").filter((line) => !line.startsWith("[Descuento]")).join("\n").trim() || null;
    } else if (dto.reason?.trim()) {
      const base = invoice.notes?.split("\n").filter((line) => !line.startsWith("[Descuento]")).join("\n").trim();
      const discountNote = `[Descuento] ${dto.reason.trim()}`;
      notes = base ? `${base}\n${discountNote}` : discountNote;
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        discount: String(discount),
        notes: notes || null,
      },
    });

    await this.recalcInvoiceTotals(invoiceId);
    const updated = await this.getInvoice(branchId, invoiceId);
    this.notifyInvoiceDiscountChange(branchId, invoice, "invoice-discount");
    return updated;
  }

  private async assertDiscountApproved(
    branchId: string,
    discountPercent: number,
    approval?: { approvalPin?: string; approvalTotp?: string },
  ) {
    const posSettings = await readBranchPosSettings(this.prisma, branchId);
    if (!discountPercentRequiresApproval(discountPercent, posSettings.maxDiscountPercentWithoutPin)) {
      return;
    }
    if (!approval?.approvalPin?.trim() && !approval?.approvalTotp?.trim()) {
      throw new ForbiddenException({
        code: "APPROVAL_REQUIRED",
        message: `Descuento superior al ${posSettings.maxDiscountPercentWithoutPin}% requiere PIN de gerente o autenticador`,
        maxWithoutPin: posSettings.maxDiscountPercentWithoutPin,
        action: "discount",
      });
    }
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { company: { select: { tenantId: true } } },
    });
    if (!branch) throw new NotFoundException("Branch not found");
    await verifyElevatedApproval(this.prisma, branchId, branch.company.tenantId, {
      approvalPin: approval?.approvalPin,
      approvalTotp: approval?.approvalTotp,
    });
  }

  private notifyInvoiceDiscountChange(
    branchId: string,
    invoice: {
      id: string;
      tableSessionId?: string | null;
      tableId?: string | null;
      serviceType?: string | null;
    },
    changeType: "line-discount" | "invoice-discount",
    extra?: { lineId?: string; productName?: string },
  ) {
    this.kds.notifyInvoiceUpdated(branchId, {
      invoiceId: invoice.id,
      tableSessionId: invoice.tableSessionId,
      tableId: invoice.tableId,
      serviceType: invoice.serviceType ?? undefined,
      changeType,
      ...extra,
    });
    if (invoice.tableSessionId) {
      this.kds.notifyTableUpdated(branchId, {
        tableSessionId: invoice.tableSessionId,
        tableId: invoice.tableId ?? undefined,
        status: "updated",
      });
    }
  }

  private async assertInvoiceEditable(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") {
      throw new BadRequestException("Invoice not editable");
    }
    return invoice;
  }

  private lineGrossAmount(line: {
    qty: Prisma.Decimal | string | number;
    unitPrice: Prisma.Decimal | string | number;
    modifiers?: { priceDeltaSnapshot?: Prisma.Decimal | string | null }[];
  }) {
    const modifiersTotal = (line.modifiers ?? []).reduce(
      (sum, mod) => sum + Number(mod.priceDeltaSnapshot ?? "0"),
      0,
    );
    return Number(line.qty) * Number(line.unitPrice) + modifiersTotal;
  }

  private async recalcLineTotals(lineId: string, companyId: string, previousGross?: number) {
    const line = await this.prisma.salesInvoiceLine.findFirst({
      where: { id: lineId },
      include: { modifiers: true },
    });
    if (!line) return;

    const gross = this.lineGrossAmount(line);
    let lineDiscount = Number(line.lineDiscount);
    if (previousGross != null && lineDiscount >= previousGross - 1) {
      lineDiscount = gross;
    }
    lineDiscount = Math.min(Math.max(0, lineDiscount), gross);

    let ivaRate = line.ivaRateSnapshot != null ? Number(line.ivaRateSnapshot) : undefined;
    let consumptionRate = line.consumptionRateSnapshot != null ? Number(line.consumptionRateSnapshot) : undefined;
    if (ivaRate == null || consumptionRate == null) {
      const resolved = await this.taxes.resolveRates(companyId, line.ivaTaxCode, line.consumptionTaxCode);
      ivaRate = ivaRate ?? resolved.ivaRate;
      consumptionRate = consumptionRate ?? resolved.consumptionRate;
    }

    const netGross = gross - lineDiscount;
    const { lineSubtotal, lineConsumptionTax, lineTax, lineTotal } = calcLineAmountsFromRates(
      netGross,
      ivaRate,
      consumptionRate,
    );

    await this.prisma.salesInvoiceLine.update({
      where: { id: lineId },
      data: {
        lineDiscount: String(lineDiscount),
        lineSubtotal: String(lineSubtotal),
        lineConsumptionTax: String(lineConsumptionTax),
        lineTax: String(lineTax),
        lineTotal: String(lineTotal),
      },
    });
  }

  async updateLineNote(branchId: string, invoiceId: string, lineId: string, lineNotes: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({ where: { id: invoiceId, branchId } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid" || invoice.status === "voided") throw new BadRequestException("Invoice not editable");

    const line = await this.prisma.salesInvoiceLine.findFirst({ where: { id: lineId, invoiceId } });
    if (!line) throw new NotFoundException("Line not found");

    const activeKds = await this.prisma.kdsItem.findFirst({
      where: {
        invoiceLineId: lineId,
        ticket: { branchId, invoiceId },
        status: { not: "canceled" },
      },
    });
    if (activeKds) {
      throw new BadRequestException("No se puede cambiar la nota de un producto ya enviado a cocina");
    }

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
    const linesToMove = invoice.lines.filter((l: any) => uniqueIds.includes(l.id));
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
        where: { id: { in: linesToMove.map((l: any) => l.id) }, invoiceId: invoice.id },
        data: { invoiceId: created.id },
      });

      const movedKdsItems = await tx.kdsItem.findMany({
        where: { invoiceLineId: { in: linesToMove.map((l: any) => l.id) } },
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
    let invoice = await this.getInvoice(branchId, invoiceId);
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (invoice.status === "paid") throw new BadRequestException("Already paid");
    if (invoice.lines.length === 0) throw new BadRequestException("Invoice has no lines");

    // Adjuntar cliente / consumidor genérico antes de cobrar
    if (dto.requiresNamedBuyer !== undefined || dto.customerId || dto.customer) {
      const attached = await this.customers.attachToInvoice(branchId, invoiceId, {
        requiresNamedBuyer: dto.requiresNamedBuyer ?? Boolean(dto.customerId || dto.customer),
        customerId: dto.customerId,
        customer: dto.customer,
        applyLoyaltyDiscount: dto.applyLoyaltyDiscount,
      });
      if (
        dto.applyLoyaltyDiscount &&
        attached.suggestedDiscountPercent &&
        attached.suggestedDiscountPercent > 0
      ) {
        await this.applyInvoiceDiscount(branchId, invoiceId, {
          kind: "percent",
          value: String(attached.suggestedDiscountPercent),
          reason: "Descuento fidelización cliente",
        });
      }
      invoice = await this.getInvoice(branchId, invoiceId);
      if (!invoice) throw new NotFoundException("Invoice not found");
    } else if (!invoice.customerId) {
      // Asegura consumidor genérico en la venta
      await this.customers.attachToInvoice(branchId, invoiceId, { requiresNamedBuyer: false });
      invoice = await this.getInvoice(branchId, invoiceId);
      if (!invoice) throw new NotFoundException("Invoice not found");
    }

    const totalWithTip = Number(invoice.total) + Number(dto.tipAmount ?? 0);
    const totalPaid = dto.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    if (totalPaid < totalWithTip) throw new BadRequestException("Insufficient payment");

    const openSession = await this.prisma.posSession.findFirst({ where: { branchId, status: "open" } });
    if (!openSession) throw new BadRequestException("Debe abrir caja antes de cobrar");

    for (const p of dto.payments) {
      this.assertPaymentDetails(p.method, p.reference, p.details);
    }

    const needsPickupCode =
      ["counter", "takeaway"].includes(invoice.serviceType) && !invoice.pickupCode;
    const pickupCode = needsPickupCode ? await this.nextAutoOrderCode(branchId) : undefined;

    let closedTableSession: { tableSessionId: string; tableId: string | null } | null = null;

    const paidInvoice = await this.prisma.$transaction(async (tx: any) => {
      await tx.payment.createMany({
        data: dto.payments.map((p) => {
          const d = p.details;
          const lastFour = d?.lastFour?.replace(/\D/g, "").slice(-4) || null;
          return {
            invoiceId: invoice.id,
            method: p.method,
            amount: p.amount,
            reference: p.reference?.trim() || d?.externalTxnId || d?.rrn || d?.authCode || null,
            tipAmount: p.tipAmount ?? 0,
            authCode: d?.authCode?.trim() || null,
            rrn: d?.rrn?.trim() || null,
            franchise: d?.franchise?.trim()?.toUpperCase() || null,
            lastFour,
            accountType: d?.accountType || null,
            installments: d?.installments ?? null,
            terminalId: d?.terminalId?.trim() || null,
            merchantId: d?.merchantId?.trim() || null,
            entryMode: d?.entryMode || (p.method === "card" ? "manual" : null),
            provider: d?.provider?.trim()?.toLowerCase() || null,
            externalTxnId: d?.externalTxnId?.trim() || null,
            bankName: d?.bankName?.trim() || null,
            terminalPayload: d?.terminalPayload ? (d.terminalPayload as object) : undefined,
          };
        }),
      });

      const inv = await tx.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "paid",
          paidAt: new Date(),
          tipAmount: dto.tipAmount ?? 0,
          sessionId: invoice.sessionId ?? openSession.id,
          ...(pickupCode ? { pickupCode } : {}),
        },
        include: {
          lines: { include: { modifiers: true } },
          payments: true,
          fiscalDocuments: true,
          customer: true,
        },
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

    if (paidInvoice.inv.customerId) {
      try {
        await this.customers.addLoyaltyPoints(
          paidInvoice.inv.customerId,
          Number(paidInvoice.inv.total),
        );
      } catch {
        // no bloquear cobro
      }
    }

    return { ...paidInvoice.inv, fiscalDocument: fiscalDoc };
  }

  /**
   * Mapea campos típicos de datafonos CO (Bold, Redeban, Credibanco, Nequi)
   * a Payment.details listo para /pay.
   */
  normalizeTerminalPayment(dto: TerminalPaymentResultDto) {
    const raw = { ...(dto.raw ?? {}), ...(dto.details ?? {}) } as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const k of keys) {
        const v = raw[k];
        if (v != null && String(v).trim() !== "") return String(v).trim();
      }
      return undefined;
    };
    const lastFourRaw = pick("lastFour", "last4", "cardLast4", "maskedPan", "pan");
    const lastFour = lastFourRaw ? lastFourRaw.replace(/\D/g, "").slice(-4) : undefined;
    const installmentsRaw = pick("installments", "cuotas", "quotas");
    const details = {
      authCode: pick("authCode", "authorizationCode", "approvalCode", "codigoAutorizacion", "auth"),
      rrn: pick("rrn", "retrievalReferenceNumber", "receiptNumber", "voucher"),
      franchise: pick("franchise", "brand", "cardBrand", "franquicia")?.toUpperCase(),
      lastFour: lastFour && lastFour.length === 4 ? lastFour : undefined,
      accountType: (pick("accountType", "tipoCuenta", "cardType")?.toLowerCase().includes("deb")
        ? "debit"
        : pick("accountType", "tipoCuenta", "cardType")
          ? "credit"
          : undefined) as "credit" | "debit" | undefined,
      installments: installmentsRaw ? Number(installmentsRaw) || undefined : undefined,
      terminalId: pick("terminalId", "tid", "terminal"),
      merchantId: pick("merchantId", "mid", "comercio"),
      entryMode: (pick("entryMode", "lectura", "entry_mode")?.toLowerCase() as any) || "chip",
      provider: pick("provider", "acquirer", "adquirente", "pasarela")?.toLowerCase(),
      externalTxnId: pick("externalTxnId", "transactionId", "txnId", "idTransaccion", "uuid"),
      bankName: pick("bankName", "banco", "bank"),
      terminalPayload: dto.raw ?? raw,
    };
    return {
      method: dto.method ?? "card",
      amount: dto.amount,
      reference: details.externalTxnId || details.rrn || details.authCode,
      details,
    };
  }

  private assertPaymentDetails(
    method: string,
    reference?: string,
    details?: {
      authCode?: string;
      externalTxnId?: string;
      rrn?: string;
      lastFour?: string;
    },
  ) {
    if (method === "card") {
      if (!details?.authCode?.trim()) {
        throw new BadRequestException("Pago con tarjeta requiere código de autorización del datafono");
      }
      if (details.lastFour && !/^\d{4}$/.test(details.lastFour.replace(/\D/g, "").slice(-4))) {
        throw new BadRequestException("Últimos 4 dígitos inválidos");
      }
    }
    if (method === "transfer" || method === "qr") {
      const ref = reference?.trim() || details?.externalTxnId?.trim() || details?.rrn?.trim();
      if (!ref) {
        throw new BadRequestException(
          method === "qr"
            ? "Pago QR requiere referencia / ID de transacción"
            : "Transferencia requiere número de referencia",
        );
      }
    }
  }

  async getInvoice(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: { include: { modifiers: true } },
        payments: true,
        fiscalDocuments: true,
        customer: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) return null;
    return this.enrichInvoiceWithKitchenStatus(invoice);
  }

  private async enrichInvoiceWithKitchenStatus(invoice: any) {
    if (!invoice?.lines?.length) return invoice;

    const kdsItems = await this.prisma.kdsItem.findMany({
      where: { invoiceLineId: { in: invoice.lines.map((line: any) => line.id) } },
      select: { invoiceLineId: true, status: true },
      orderBy: { createdAt: "desc" },
    });
    const statusByLine = new Map<string, string>();
    for (const item of kdsItems) {
      if (!statusByLine.has(item.invoiceLineId)) {
        statusByLine.set(item.invoiceLineId, item.status);
      }
    }

    return {
      ...invoice,
      lines: invoice.lines.map((line: any) => ({
        ...line,
        kitchenStatus: statusByLine.get(line.id) ?? null,
      })),
    };
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
    const invoice = await this.prisma.salesInvoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) return;

    const lines = await this.prisma.salesInvoiceLine.findMany({ where: { invoiceId } });
    const subtotal = lines.reduce((sum: number, l: any) => sum + Number(l.lineSubtotal), 0);
    const consumptionTax = lines.reduce((sum: number, l: any) => sum + Number(l.lineConsumptionTax), 0);
    const tax = lines.reduce((sum: number, l: any) => sum + Number(l.lineTax), 0);
    const linesTotal = lines.reduce((sum: number, l: any) => sum + Number(l.lineTotal), 0);
    const discount = Math.min(Number(invoice.discount), linesTotal);
    const total = Math.max(0, linesTotal - discount);

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: {
        subtotal: String(subtotal),
        consumptionTax: String(consumptionTax),
        tax: String(tax),
        discount: String(discount),
        total: String(total),
      },
    });
  }
}
