import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OpenTableSessionDto } from "./dto/open-table-session.dto";
import { TransferWaiterDto } from "./dto/transfer-waiter.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { UpdateDailyMenuDto } from "./dto/update-daily-menu.dto";
import {
  buildReservationWebhookPayload,
  buildReservationWhatsAppLink,
  buildReservationWhatsAppMessageText,
} from "./reservation-notify.util";
import { KdsService } from "../kds/kds.service";
import { WaiterAttributionService } from "./waiter-attribution.service";
import { WaiterAttributionDto } from "./dto/open-table-session.dto";

type DailyMenuSettings = {
  date: string;
  note?: string;
  items: { productId: string; priceOverride?: number }[];
};

@Injectable()
export class RestaurantService {
  constructor(
    private prisma: PrismaService,
    private kds: KdsService,
    private waiterAttr: WaiterAttributionService,
  ) {}

  private emitTableMapUpdated(
    branchId: string,
    payload: { tableId: string; tableSessionId: string; status: "opened" | "updated" | "closed" },
  ) {
    this.kds.notifyTableUpdated(branchId, payload);
  }

  private todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  private async getBranchSettingsRaw(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    return { branch, settings, branches, branchSettings: (branches[branchId] ?? {}) as Record<string, unknown> };
  }

  private async saveBranchSettings(branchId: string, patch: Record<string, unknown>) {
    const { branch, settings, branches, branchSettings } = await this.getBranchSettingsRaw(branchId);
    branches[branchId] = { ...branchSettings, ...patch };
    await this.prisma.tenant.update({
      where: { id: branch.company.tenantId },
      data: { settings: { ...settings, branches } as object },
    });
    return branches[branchId];
  }

  private async getNotificationSettings(branchId: string) {
    const { branchSettings } = await this.getBranchSettingsRaw(branchId);
    return (branchSettings.notifications ?? {}) as {
      webhookUrl?: string;
      reservationRemindMinutes?: number;
    };
  }

  private async dispatchReservationWebhook(
    branchId: string,
    type: "reservation.created" | "reservation.reminder" | "reservation.seated" | "reservation.cancelled",
    reservation: Record<string, unknown>,
    whatsappLink?: string | null,
  ) {
    const settings = await this.getNotificationSettings(branchId);
    if (!settings.webhookUrl) return { sent: false };

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) return { sent: false };

    try {
      const res = await fetch(settings.webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildReservationWebhookPayload(type, { id: branch.id, name: branch.name }, reservation, whatsappLink),
        ),
      });
      return { sent: res.ok, status: res.status };
    } catch (err: any) {
      return { sent: false, error: err.message };
    }
  }

  private reservationMessageInput(branchName: string, reservation: any) {
    return {
      customerPhone: reservation.customerPhone,
      customerName: reservation.customerName,
      guestsCount: reservation.guestsCount,
      reservedFor: reservation.reservedFor,
      branchName,
      tableName: reservation.table?.name ?? null,
      areaName: reservation.table?.area?.name ?? null,
      notes: reservation.notes,
    };
  }

  private enrichReservation(branchName: string, reservation: any) {
    const base = this.reservationMessageInput(branchName, reservation);
    return {
      ...reservation,
      whatsappLink: buildReservationWhatsAppLink(base, "confirm"),
      reminderWhatsAppLink: buildReservationWhatsAppLink(base, "reminder"),
      seatedWhatsAppLink: buildReservationWhatsAppLink(base, "seated"),
      cancelWhatsAppLink: buildReservationWhatsAppLink(base, "cancelled"),
    };
  }

  async getUpcomingReservations(branchId: string, withinMinutes = 120) {
    const now = new Date();
    const until = new Date(now.getTime() + withinMinutes * 60000);

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const list = await this.prisma.reservation.findMany({
      where: {
        branchId,
        status: "pending",
        reservedFor: { gte: now, lte: until },
      },
      orderBy: { reservedFor: "asc" },
      include: { table: { include: { area: true } } },
    });

    return list.map((r) => this.enrichReservation(branch?.name ?? "Restaurante", r));
  }

  async getDailyMenu(branchId: string) {
    const { branchSettings } = await this.getBranchSettingsRaw(branchId);
    const stored = branchSettings.dailyMenu as DailyMenuSettings | undefined;
    const today = this.todayKey();

    if (!stored || stored.date !== today) {
      return { date: today, note: "", items: [] as any[] };
    }

    const productIds = stored.items.map((i) => i.productId);
    if (!productIds.length) return { date: today, note: stored.note ?? "", items: [] };

    const products = await this.prisma.product.findMany({
      where: { branchId, id: { in: productIds }, isActive: true },
      include: { variants: true, category: true },
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const items = stored.items
      .map((item) => {
        const product = productMap.get(item.productId);
        if (!product) return null;
        const variant = product.variants[0];
        const basePrice = Number(variant?.price ?? 0);
        return {
          productId: product.id,
          name: product.name,
          category: product.category?.name,
          course: product.course,
          barcode: variant?.barcode,
          price: item.priceOverride ?? basePrice,
          basePrice,
        };
      })
      .filter(Boolean);

    return { date: today, note: stored.note ?? "", items };
  }

  async updateDailyMenu(branchId: string, dto: UpdateDailyMenuDto) {
    const today = this.todayKey();
    const unique = new Map<string, { productId: string; priceOverride?: number }>();
    for (const item of dto.items) unique.set(item.productId, item);

    await this.saveBranchSettings(branchId, {
      dailyMenu: {
        date: today,
        note: dto.note ?? "",
        items: [...unique.values()],
      },
    });

    return this.getDailyMenu(branchId);
  }

  async getReservations(branchId: string, date?: string) {
    const day = date ?? this.todayKey();
    const start = new Date(`${day}T00:00:00-05:00`);
    const end = new Date(`${day}T23:59:59.999-05:00`);

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });

    const list = await this.prisma.reservation.findMany({
      where: {
        branchId,
        reservedFor: { gte: start, lte: end },
        status: { in: ["pending", "seated"] },
      },
      orderBy: { reservedFor: "asc" },
      include: { table: { include: { area: true } } },
    });

    return list.map((r) => this.enrichReservation(branch?.name ?? "Restaurante", r));
  }

  async previewReservationWhatsApp(branchId: string, dto: CreateReservationDto) {
    if (!dto.customerName?.trim()) {
      throw new BadRequestException("Nombre del cliente requerido");
    }
    if (!dto.reservedFor) {
      throw new BadRequestException("Hora de reserva requerida");
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    let table: { name: string; area?: { name: string } | null } | null = null;
    if (dto.tableId) {
      table = await this.prisma.table.findFirst({
        where: { id: dto.tableId, branchId, isActive: true },
        include: { area: true },
      });
    }

    const input = {
      customerPhone: dto.customerPhone ?? null,
      customerName: dto.customerName.trim(),
      guestsCount: dto.guestsCount || 2,
      reservedFor: new Date(dto.reservedFor),
      branchName: branch?.name ?? "Restaurante de Yall",
      tableName: table?.name ?? null,
      areaName: table?.area?.name ?? null,
      notes: dto.notes ?? null,
    };

    return {
      message: buildReservationWhatsAppMessageText(input, "confirm"),
      whatsappLink: buildReservationWhatsAppLink(input, "confirm"),
      hasPhone: Boolean(input.customerPhone?.trim()),
    };
  }

  async createReservation(branchId: string, dto: CreateReservationDto) {
    if (dto.tableId) {
      const table = await this.prisma.table.findFirst({ where: { id: dto.tableId, branchId, isActive: true } });
      if (!table) throw new BadRequestException("Mesa no válida");
    }

    const created = await this.prisma.reservation.create({
      data: {
        branchId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone ?? null,
        guestsCount: dto.guestsCount,
        reservedFor: new Date(dto.reservedFor),
        tableId: dto.tableId ?? null,
        notes: dto.notes ?? null,
      },
      include: { table: { include: { area: true } } },
    });

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const enriched = this.enrichReservation(branch?.name ?? "Restaurante de Yall", created);

    const webhook = await this.dispatchReservationWebhook(
      branchId,
      "reservation.created",
      enriched,
      enriched.whatsappLink,
    );

    return { ...enriched, webhook };
  }

  async updateReservation(branchId: string, id: string, dto: UpdateReservationDto) {
    const reservation = await this.prisma.reservation.findFirst({ where: { id, branchId } });
    if (!reservation) throw new NotFoundException("Reserva no encontrada");

    const updated = await this.prisma.reservation.update({
      where: { id },
      data: {
        status: dto.status,
        notes: dto.notes,
        tableId: dto.tableId,
      },
      include: { table: { include: { area: true } } },
    });

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const enriched = this.enrichReservation(branch?.name ?? "Restaurante", updated);

    if (dto.status === "cancelled") {
      const webhook = await this.dispatchReservationWebhook(
        branchId,
        "reservation.cancelled",
        enriched,
        enriched.cancelWhatsAppLink,
      );
      return { ...enriched, webhook };
    }

    return enriched;
  }

  async seatReservation(branchId: string, reservationId: string, waiterId: string) {
    const reservation = await this.prisma.reservation.findFirst({
      where: { id: reservationId, branchId, status: "pending" },
    });
    if (!reservation) throw new NotFoundException("Reserva no encontrada o ya atendida");

    const waiter = await this.prisma.staff.findFirst({
      where: { id: waiterId, branchId, role: "waiter", isActive: true },
    });
    if (!waiter) throw new BadRequestException("Mesero no válido");

    let tableId = reservation.tableId;
    if (tableId) {
      const occupied = await this.prisma.tableSession.findFirst({
        where: { branchId, tableId, status: "open" },
      });
      if (occupied) throw new BadRequestException("La mesa reservada está ocupada");
    } else {
      const tables = await this.prisma.table.findMany({
        where: { branchId, isActive: true },
        include: { sessions: { where: { status: "open" }, take: 1 } },
        orderBy: { name: "asc" },
      });
      const free = tables.find(
        (t) => !t.sessions.length && (!t.capacity || t.capacity >= reservation.guestsCount),
      );
      if (!free) throw new BadRequestException("No hay mesas libres para esta reserva");
      tableId = free.id;
    }

    const session = await this.openTableSession(branchId, {
      tableId: tableId!,
      waiterId,
      guestsCount: reservation.guestsCount,
    });

    const updated = await this.prisma.reservation.update({
      where: { id: reservationId },
      data: {
        status: "seated",
        seatedAt: new Date(),
        tableId,
        tableSessionId: session.id,
      },
      include: { table: { include: { area: true } } },
    });

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const enriched = this.enrichReservation(branch?.name ?? "Restaurante de Yall", updated);

    const webhook = await this.dispatchReservationWebhook(
      branchId,
      "reservation.seated",
      enriched,
      enriched.seatedWhatsAppLink,
    );

    return { reservation: enriched, session, seatedWhatsAppLink: enriched.seatedWhatsAppLink, webhook };
  }

  async getCompanies(tenantId: string) {
    return this.prisma.company.findMany({
      where: { tenantId },
      orderBy: { name: "asc" },
      include: { branches: true },
    });
  }

  async getBranches(companyId: string, tenantId: string) {
    return this.prisma.branch.findMany({
      where: { companyId, company: { tenantId } },
      orderBy: { name: "asc" },
    });
  }

  async getAreas(branchId: string) {
    return this.prisma.diningArea.findMany({ where: { branchId, isActive: true }, orderBy: { name: "asc" } });
  }

  async getTables(branchId: string, areaId?: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: true },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");

    const tables = await this.prisma.table.findMany({
      where: { branchId, isActive: true, ...(areaId ? { diningAreaId: areaId } : {}) },
      orderBy: [{ diningAreaId: "asc" }, { name: "asc" }],
      include: {
        area: true,
        sessions: {
          where: { status: "open" },
          take: 1,
          orderBy: { openedAt: "desc" },
          include: {
            invoices: {
              where: { status: { in: ["draft", "sent_to_kitchen"] } },
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                total: true,
                status: true,
                tableReadyNotifiedAt: true,
                tableReadyServedAt: true,
                _count: { select: { lines: true } },
              },
            },
          },
        },
      },
    });

    const nameFor = await this.waiterAttr.resolveDisplayNames(
      branchId,
      branch.company.tenantId,
      tables.flatMap((t) => t.sessions),
    );

    return tables.map((table) => ({
      ...table,
      sessions: table.sessions.map((session) => {
        const hasActiveOrder = session.invoices.some(
          (invoice) =>
            invoice.status === "sent_to_kitchen" ||
            Number(invoice.total) > 0 ||
            invoice._count.lines > 0,
        );
        const [primaryInvoice] = session.invoices;
        const kitchenReadyPending = !!(
          primaryInvoice?.tableReadyNotifiedAt && !primaryInvoice?.tableReadyServedAt
        );
        return {
          id: session.id,
          guestsCount: session.guestsCount,
          waiterId: session.waiterId,
          waiterUserId: session.waiterUserId,
          waiterName: nameFor(session),
          openInvoiceCount: session.invoices.length,
          canClose: !hasActiveOrder,
          kitchenReadyPending,
          invoices: primaryInvoice
            ? [{
                id: primaryInvoice.id,
                total: primaryInvoice.total,
                status: primaryInvoice.status,
                kitchenReadyPending,
              }]
            : [],
        };
      }),
    }));
  }

  async getWaiters(branchId: string) {
    return this.prisma.staff.findMany({
      where: { branchId, role: "waiter", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, role: true, isActive: true },
    });
  }

  async updateWaiter(branchId: string, waiterId: string, phone?: string) {
    const waiter = await this.prisma.staff.findFirst({
      where: { id: waiterId, branchId, role: "waiter", isActive: true },
    });
    if (!waiter) throw new NotFoundException("Mesero no encontrado");

    return this.prisma.staff.update({
      where: { id: waiterId },
      data: { phone: phone?.trim() || null },
      select: { id: true, name: true, phone: true, role: true, isActive: true },
    });
  }

  async openTableSession(branchId: string, dto: OpenTableSessionDto, openedByUserId?: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: true },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");

    const table = await this.prisma.table.findFirst({ where: { id: dto.tableId, branchId, isActive: true } });
    if (!table) throw new NotFoundException("Table not found");

    const existing = await this.prisma.tableSession.findFirst({ where: { branchId, tableId: dto.tableId, status: "open" }});
    if (existing) throw new BadRequestException("Table already has an open session");

    const attribution = await this.waiterAttr.resolve(branchId, branch.company.tenantId, dto);

    const session = await this.prisma.tableSession.create({
      data: {
        branchId,
        tableId: dto.tableId,
        waiterId: attribution.waiterId,
        waiterUserId: attribution.waiterUserId,
        status: "open",
        guestsCount: dto.guestsCount,
        openedByUserId,
      },
    });

    this.emitTableMapUpdated(branchId, {
      tableId: dto.tableId,
      tableSessionId: session.id,
      status: "opened",
    });

    return session;
  }

  async assignSessionWaiter(
    branchId: string,
    sessionId: string,
    tenantId: string,
    dto: WaiterAttributionDto,
  ) {
    const session = await this.prisma.tableSession.findFirst({ where: { id: sessionId, branchId } });
    if (!session) throw new NotFoundException("Table session not found");
    if (session.status !== "open") throw new BadRequestException("Solo sesiones abiertas");

    const attribution = await this.waiterAttr.resolve(branchId, tenantId, dto);

    const updated = await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: {
        waiterId: attribution.waiterId,
        waiterUserId: attribution.waiterUserId,
      },
    });

    await this.waiterAttr.applyToOpenInvoices(branchId, sessionId, attribution);

    this.emitTableMapUpdated(branchId, {
      tableId: session.tableId,
      tableSessionId: sessionId,
      status: "updated",
    });

    return updated;
  }

  async transferWaiter(branchId: string, sessionId: string, dto: TransferWaiterDto) {
    const session = await this.prisma.tableSession.findFirst({ where: { id: sessionId, branchId } });
    if (!session) throw new NotFoundException("Table session not found");
    if (session.status !== "open") throw new BadRequestException("Only open sessions can be transferred");
    if (session.waiterId === dto.newWaiterId) return session;

    const waiter = await this.prisma.staff.findFirst({
      where: { id: dto.newWaiterId, branchId, role: "waiter", isActive: true },
    });
    if (!waiter) throw new BadRequestException("Waiter not found");

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.tableSession.update({
        where: { id: sessionId },
        data: { waiterId: dto.newWaiterId, waiterUserId: null },
      });

      const openInvoices = await tx.salesInvoice.findMany({
        where: {
          branchId,
          tableSessionId: sessionId,
          status: { in: ["draft", "sent_to_kitchen"] },
        },
        select: { id: true },
      });

      if (openInvoices.length) {
        await tx.salesInvoice.updateMany({
          where: { id: { in: openInvoices.map((i) => i.id) } },
          data: { waiterId: dto.newWaiterId, waiterUserId: null },
        });
        await tx.kdsTicket.updateMany({
          where: { invoiceId: { in: openInvoices.map((i) => i.id) } },
          data: { waiterId: dto.newWaiterId },
        });
      }

      this.emitTableMapUpdated(branchId, {
        tableId: session.tableId,
        tableSessionId: sessionId,
        status: "updated",
      });

      return updated;
    });
  }

  async closeTableSession(branchId: string, sessionId: string) {
    const session = await this.prisma.tableSession.findFirst({ where: { id: sessionId, branchId } });
    if (!session) throw new NotFoundException("Table session not found");
    if (session.status !== "open") throw new BadRequestException("Session is not open");

    const openInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        tableSessionId: sessionId,
        status: { in: ["draft", "sent_to_kitchen"] },
      },
      include: { lines: true },
    });

    const blocking = openInvoices.filter(
      (invoice) =>
        invoice.status === "sent_to_kitchen" ||
        invoice.lines.length > 0 ||
        Number(invoice.total) > 0,
    );
    if (blocking.length > 0) {
      throw new BadRequestException("Hay comandas abiertas. Cobre o anule antes de cerrar la mesa.");
    }

    const voidedAt = new Date();
    for (const invoice of openInvoices) {
      const noteSuffix = "[Anulado] Mesa cerrada sin pedido";
      await this.prisma.salesInvoice.update({
        where: { id: invoice.id },
        data: {
          status: "voided",
          voidedAt,
          notes: invoice.notes ? `${invoice.notes}\n${noteSuffix}` : noteSuffix,
        },
      });
    }

    const closed = await this.prisma.tableSession.update({
      where: { id: sessionId },
      data: { status: "closed", closedAt: new Date() },
    });

    this.emitTableMapUpdated(branchId, {
      tableId: session.tableId,
      tableSessionId: sessionId,
      status: "closed",
    });

    return { ...closed, voidedInvoices: openInvoices.length };
  }
}
