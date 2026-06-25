import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  buildOrderReadyWebhookPayload,
  buildPickupReadySmsLink,
  buildPickupReadyWhatsAppLink,
  buildTableOverdueWebhookPayload,
  buildTableOverdueHostWhatsAppLink,
  buildTableOverdueWaiterWhatsAppLink,
  buildTableReadyWaiterWhatsAppLink,
  buildTableSlaWebhookPayload,
} from "../restaurant/reservation-notify.util";
import {
  readBranchNotificationSettings,
  saveLastSlaAlertWeekStart,
} from "../settings/branch-notifications.util";

type PickupLinks = {
  whatsappLink: string | null;
  smsLink: string | null;
  itemsSummary: string;
};

@Injectable()
export class OrderNotifyService {
  constructor(private prisma: PrismaService) {}

  private async getBranchContext(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) return null;

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
    const notifications = (branchSettings.notifications ?? {}) as {
      webhookUrl?: string;
      pickupNotifyAuto?: boolean;
      tableReadyWarnMinutes?: number;
      tableReadyOverdueWebhookEnabled?: boolean;
    };

    return { branch, notifications };
  }

  private buildItemsSummary(lines: { nameSnapshot: string; qty: unknown }[]) {
    const preview = lines.slice(0, 3).map((l) => `${Number(l.qty) > 1 ? `${l.qty}× ` : ""}${l.nameSnapshot}`);
    const extra = lines.length > 3 ? ` y ${lines.length - 3} más` : "";
    return preview.join(", ") + extra;
  }

  private buildLinks(
    invoice: {
      pickupPhone?: string | null;
      pickupName?: string | null;
      pickupCode?: string | null;
      invoiceNumber?: string | null;
      lines: { nameSnapshot: string; qty: unknown }[];
    },
    branchName: string,
  ): PickupLinks {
    const itemsSummary = this.buildItemsSummary(invoice.lines);
    const base = {
      pickupPhone: invoice.pickupPhone,
      customerName: invoice.pickupName,
      branchName,
      itemsSummary,
      invoiceNumber: invoice.invoiceNumber,
      pickupCode: invoice.pickupCode,
    };
    return {
      whatsappLink: buildPickupReadyWhatsAppLink(base),
      smsLink: buildPickupReadySmsLink(base),
      itemsSummary,
    };
  }

  async getPickupNotifyStatus(branchId: string, invoiceId: string) {
    const ctx = await this.getBranchContext(branchId);
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: { lines: true },
    });
    if (!invoice || !ctx) return { ok: false, reason: "not_found" };

    const links = this.buildLinks(invoice, ctx.branch.name);
    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });

    const activeItems = ticket?.items.filter((i) => i.status !== "canceled") ?? [];
    const allReady = activeItems.length > 0 && activeItems.every((i) => i.status === "ready");

    return {
      ok: true,
      pickupPhone: invoice.pickupPhone,
      pickupName: invoice.pickupName,
      pickupNotifiedAt: invoice.pickupNotifiedAt,
      allReady,
      hasKitchenTicket: activeItems.length > 0,
      ...links,
    };
  }

  async tryNotifyPickupReady(branchId: string, invoiceId: string, force = false) {
    const ctx = await this.getBranchContext(branchId);
    if (!ctx) return { notified: false, reason: "branch_not_found" };

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: { lines: true },
    });
    if (!invoice) return { notified: false, reason: "invoice_not_found" };

    if (!["counter", "takeaway"].includes(invoice.serviceType)) {
      return { notified: false, reason: "not_pickup_order" };
    }
    if (!invoice.pickupPhone) {
      return { notified: false, reason: "no_phone" };
    }

    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });
    const activeItems = ticket?.items.filter((i) => i.status !== "canceled") ?? [];
    if (activeItems.length === 0) {
      return { notified: false, reason: "no_kds_items" };
    }
    if (!activeItems.every((i) => i.status === "ready")) {
      return { notified: false, reason: "not_all_ready" };
    }

    const links = this.buildLinks(invoice, ctx.branch.name);
    if (invoice.pickupNotifiedAt && !force) {
      return { notified: false, reason: "already_notified", ...links };
    }

    let webhook: { sent: boolean; status?: number; error?: string } = { sent: false };
    const auto = ctx.notifications.pickupNotifyAuto !== false;
    if (auto && ctx.notifications.webhookUrl) {
      try {
        const res = await fetch(ctx.notifications.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildOrderReadyWebhookPayload(
              { id: ctx.branch.id, name: ctx.branch.name },
              invoice as unknown as Record<string, unknown>,
              links,
            ),
          ),
        });
        webhook = { sent: res.ok, status: res.status };
      } catch (err: any) {
        webhook = { sent: false, error: err.message };
      }
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { pickupNotifiedAt: new Date() },
    });

    return { notified: true, ...links, webhook };
  }

  async tryNotifyTableReady(branchId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) return { notified: false, reason: "invoice_not_found" };
    if (invoice.serviceType !== "dine_in" || !invoice.tableSessionId) {
      return { notified: false, reason: "not_table_order" };
    }
    if (invoice.tableReadyNotifiedAt) {
      return { notified: false, reason: "already_notified" };
    }

    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId },
      include: { items: true },
    });
    const activeItems = ticket?.items.filter((i) => i.status !== "canceled") ?? [];
    if (activeItems.length === 0) {
      return { notified: false, reason: "no_kds_items" };
    }
    if (!activeItems.every((i) => i.status === "ready")) {
      return { notified: false, reason: "not_all_ready" };
    }

    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mesa";
    const itemsSummary = this.buildItemsSummary(invoice.lines);

    let waiterWhatsAppLink: string | null = null;
    const settings = await readBranchNotificationSettings(this.prisma, branchId);
    if (settings?.tableReadyWaiterWhatsAppEnabled && invoice.waiterId) {
      const waiter = await this.prisma.staff.findFirst({
        where: { id: invoice.waiterId, branchId },
        select: { phone: true },
      });
      const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
      waiterWhatsAppLink = buildTableReadyWaiterWhatsAppLink({
        waiterPhone: waiter?.phone,
        branchName: branch?.name ?? "Restaurante",
        tableLabel,
        itemsSummary,
      });
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { tableReadyNotifiedAt: new Date() },
    });

    return {
      notified: true,
      invoiceId,
      tableSessionId: invoice.tableSessionId,
      tableId: invoice.tableId,
      tableLabel,
      itemsSummary,
      waiterId: invoice.waiterId,
      waiterWhatsAppLink,
    };
  }

  async tryNotifyTableOverdue(branchId: string, invoiceId: string, waitingMinutes: number) {
    const settings = await readBranchNotificationSettings(this.prisma, branchId);
    if (!settings) return { notified: false, reason: "branch_not_found" };

    const threshold = settings.tableReadyWarnMinutes;
    if (waitingMinutes < threshold) {
      return { notified: false, reason: "below_threshold" };
    }

    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
    });
    if (!invoice) return { notified: false, reason: "invoice_not_found" };
    if (invoice.serviceType !== "dine_in" || !invoice.tableReadyNotifiedAt || invoice.tableReadyServedAt) {
      return { notified: false, reason: "not_pending_table" };
    }

    const table = invoice.tableSession?.table;
    const tableLabel = table
      ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
      : "Mesa";
    const itemsSummary = this.buildItemsSummary(invoice.lines);

    let waiterName: string | null = null;
    let waiterPhone: string | null = null;
    if (invoice.waiterId) {
      const waiter = await this.prisma.staff.findFirst({
        where: { id: invoice.waiterId, branchId },
        select: { name: true, phone: true },
      });
      waiterName = waiter?.name ?? "Mesero";
      waiterPhone = waiter?.phone ?? null;
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const branchName = branch?.name ?? "Restaurante";

    const hostWhatsAppLink =
      settings.tableReadyHostWhatsAppEnabled && settings.hostPhone
        ? buildTableOverdueHostWhatsAppLink({
            hostPhone: settings.hostPhone,
            branchName,
            tableLabel,
            waiterName,
            waitingMinutes,
            warnAfterMinutes: threshold,
            itemsSummary,
          })
        : null;
    const waiterWhatsAppLink =
      settings.tableReadyWaiterWhatsAppEnabled && waiterPhone
        ? buildTableOverdueWaiterWhatsAppLink({
            waiterPhone,
            branchName,
            tableLabel,
            waitingMinutes,
            warnAfterMinutes: threshold,
            itemsSummary,
          })
        : null;

    if (invoice.tableReadyOverdueNotifiedAt) {
      return {
        notified: false,
        reason: "already_notified",
        hostWhatsAppLink,
        waiterWhatsAppLink,
        tableLabel,
        waitingMinutes,
      };
    }

    let webhook: { sent: boolean; status?: number; error?: string } = { sent: false };
    const webhookEnabled = settings.tableReadyOverdueWebhookEnabled && settings.webhookUrl;
    if (webhookEnabled) {
      try {
        const res = await fetch(settings.webhookUrl!, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...buildTableOverdueWebhookPayload(
              { id: branchId, name: branchName },
              {
                invoiceId: invoice.id,
                tableSessionId: invoice.tableSessionId,
                tableId: invoice.tableId,
                tableLabel,
                waiterId: invoice.waiterId,
                waiterName,
                waitingMinutes,
                warnAfterMinutes: threshold,
                readyAt: invoice.tableReadyNotifiedAt,
                itemsSummary,
                total: invoice.total,
              },
            ),
            hostWhatsAppLink,
            waiterWhatsAppLink,
          }),
        });
        webhook = { sent: res.ok, status: res.status };
      } catch (err: any) {
        webhook = { sent: false, error: err.message };
      }
    }

    if (!webhook.sent && !hostWhatsAppLink && !waiterWhatsAppLink) {
      return { notified: false, reason: "no_channels", hostWhatsAppLink: null, waiterWhatsAppLink: null };
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { tableReadyOverdueNotifiedAt: new Date() },
    });

    return {
      notified: true,
      invoiceId,
      tableSessionId: invoice.tableSessionId,
      tableId: invoice.tableId,
      tableLabel,
      waitingMinutes,
      hostWhatsAppLink,
      waiterWhatsAppLink,
      webhook,
    };
  }

  async tryNotifyWeeklySlaBreach(
    branchId: string,
    input: {
      weekStart: string;
      weekEnd: string;
      avgWaitMinutes: number;
      servedCount: number;
      withinSlaCount: number;
      compliancePct: number;
    },
  ) {
    const settings = await readBranchNotificationSettings(this.prisma, branchId);
    if (!settings) return { notified: false, reason: "branch_not_found" };
    if (input.servedCount === 0) return { notified: false, reason: "no_data" };

    const slaMinutes = settings.tableReadySlaMinutes;
    if (input.avgWaitMinutes <= slaMinutes) {
      return { notified: false, reason: "within_sla" };
    }
    if (settings.lastSlaAlertWeekStart === input.weekStart) {
      return { notified: false, reason: "already_notified" };
    }

    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const branchName = branch?.name ?? "Restaurante";

    let webhook: { sent: boolean; status?: number; error?: string } = { sent: false };
    if (settings.tableReadySlaWebhookEnabled && settings.webhookUrl) {
      try {
        const res = await fetch(settings.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildTableSlaWebhookPayload(
              { id: branchId, name: branchName },
              {
                weekStart: input.weekStart,
                weekEnd: input.weekEnd,
                slaMinutes,
                avgWaitMinutes: input.avgWaitMinutes,
                servedCount: input.servedCount,
                withinSlaCount: input.withinSlaCount,
                compliancePct: input.compliancePct,
              },
            ),
          ),
        });
        webhook = { sent: res.ok, status: res.status };
      } catch (err: any) {
        webhook = { sent: false, error: err.message };
      }
    }

    await saveLastSlaAlertWeekStart(this.prisma, branchId, input.weekStart);

    return {
      notified: true,
      slaMinutes,
      avgWaitMinutes: input.avgWaitMinutes,
      compliancePct: input.compliancePct,
      webhook,
    };
  }
}
