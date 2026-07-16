import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OrderNotifyService } from "../notifications/order-notify.service";
import { readBranchNotificationSettings } from "../settings/branch-notifications.util";
import { buildTableServiceTimesCsv, buildTableServiceTimesHtml, buildTableServiceTimesWeeklyCsv, buildTableServiceTimesWeeklyHtml } from "./table-service-times.export";
import {
  getServiceShift,
  getWeekStartMonday,
  SERVICE_SHIFT_LABELS,
  type ServiceShift,
} from "../restaurant/reservation-notify.util";

function extractVoidReason(notes?: string | null): string | null {
  if (!notes) return null;
  const line = notes.split("\n").find((entry) => entry.startsWith("[Anulado]"));
  if (!line) return null;
  const reason = line.replace("[Anulado]", "").trim();
  return reason || null;
}

function buildOrderLabel(invoice: {
  serviceType: string;
  pickupCode?: string | null;
  pickupName?: string | null;
  deliveryName?: string | null;
  tableSessionId?: string | null;
}) {
  if (invoice.serviceType === "delivery") {
    return `Domicilio · ${invoice.deliveryName ?? "Sin nombre"}`;
  }
  if (invoice.serviceType === "takeaway") {
    const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
    const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
    return `Para llevar${code}${name}`;
  }
  if (invoice.tableSessionId) return "Mesa";
  const code = invoice.pickupCode ? ` #${invoice.pickupCode}` : "";
  const name = invoice.pickupName ? ` · ${invoice.pickupName}` : "";
  return `Mostrador${code}${name}`;
}

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private orderNotify: OrderNotifyService,
  ) {}

  private buildSlaSummary(rows: { waitMinutes: number }[], slaMinutes: number) {
    const withinSlaCount = rows.filter((row) => row.waitMinutes <= slaMinutes).length;
    const avgWaitMinutes = rows.length
      ? Math.round(rows.reduce((sum, row) => sum + row.waitMinutes, 0) / rows.length)
      : 0;
    const compliancePct = rows.length ? Math.round((withinSlaCount / rows.length) * 100) : 100;
    return {
      slaMinutes,
      withinSlaCount,
      compliancePct,
      breached: rows.length > 0 && avgWaitMinutes > slaMinutes,
    };
  }

  private buildSlaByWaiter(
    rows: { waiterId: string | null; waiterName: string; waitMinutes: number }[],
    slaMinutes: number,
  ) {
    const byWaiter = new Map<
      string,
      {
        waiterId: string | null;
        waiterName: string;
        count: number;
        totalWait: number;
        withinSlaCount: number;
      }
    >();

    for (const row of rows) {
      const key = row.waiterId ?? `unknown:${row.waiterName}`;
      const cur = byWaiter.get(key) ?? {
        waiterId: row.waiterId,
        waiterName: row.waiterName,
        count: 0,
        totalWait: 0,
        withinSlaCount: 0,
      };
      cur.count += 1;
      cur.totalWait += row.waitMinutes;
      if (row.waitMinutes <= slaMinutes) cur.withinSlaCount += 1;
      byWaiter.set(key, cur);
    }

    return [...byWaiter.values()]
      .map((w) => {
        const avgWaitMinutes = Math.round(w.totalWait / w.count);
        const compliancePct = Math.round((w.withinSlaCount / w.count) * 100);
        return {
          waiterId: w.waiterId,
          waiterName: w.waiterName,
          count: w.count,
          avgWaitMinutes,
          withinSlaCount: w.withinSlaCount,
          compliancePct,
          breached: avgWaitMinutes > slaMinutes,
        };
      })
      .sort((a, b) => a.compliancePct - b.compliancePct || b.count - a.count);
  }

  async getDashboard(branchId: string, fromStr?: string, toStr?: string) {
    const rangeStart = fromStr ? new Date(`${fromStr}T00:00:00`) : new Date();
    rangeStart.setHours(0, 0, 0, 0);
    const rangeEnd = toStr ? new Date(`${toStr}T00:00:00`) : new Date(rangeStart);
    rangeEnd.setHours(0, 0, 0, 0);
    rangeEnd.setDate(rangeEnd.getDate() + 1);

    if (rangeEnd <= rangeStart) {
      rangeEnd.setTime(rangeStart.getTime());
      rangeEnd.setDate(rangeEnd.getDate() + 1);
    }

    const paidInvoices = await this.prisma.salesInvoice.findMany({
      where: { branchId, status: "paid", paidAt: { gte: rangeStart, lt: rangeEnd } },
      include: { payments: true, lines: true, fiscalDocuments: true },
    });

    const totalSales = paidInvoices.reduce((s, i) => s + Number(i.total), 0);
    const totalTax = paidInvoices.reduce((s, i) => s + Number(i.tax) + Number(i.consumptionTax), 0);
    const totalTips = paidInvoices.reduce((s, i) => s + Number(i.tipAmount), 0);
    const ticketAvg = paidInvoices.length ? totalSales / paidInvoices.length : 0;

    const byMethod: Record<string, number> = {};
    for (const inv of paidInvoices) {
      for (const p of inv.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
    }

    const productMap = new Map<string, { name: string; qty: number; total: number }>();
    for (const inv of paidInvoices) {
      for (const line of inv.lines) {
        const key = line.nameSnapshot;
        const cur = productMap.get(key) ?? { name: key, qty: 0, total: 0 };
        cur.qty += Number(line.qty);
        cur.total += Number(line.lineTotal);
        productMap.set(key, cur);
      }
    }
    const topProducts = [...productMap.values()].sort((a, b) => b.total - a.total).slice(0, 10);

    const fiscalAccepted = paidInvoices.filter((i) =>
      i.fiscalDocuments.some((d) => d.status === "accepted"),
    ).length;
    const fiscalContingency = paidInvoices.filter((i) =>
      i.fiscalDocuments.some((d) => d.status === "contingency"),
    ).length;

    const openSession = await this.prisma.posSession.findFirst({
      where: { branchId, status: "open" },
    });

    const hourlyMap = new Map<number, number>();
    for (const inv of paidInvoices) {
      const h = (inv.paidAt ?? inv.createdAt).getHours();
      hourlyMap.set(h, (hourlyMap.get(h) ?? 0) + Number(inv.total));
    }
    const salesByHour = [...hourlyMap.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, total]) => ({ hour, total }));

    const waiterMap = new Map<string, { waiterId: string | null; waiterUserId: string | null; name: string; sales: number; tips: number; count: number }>();
    for (const inv of paidInvoices) {
      const key = inv.waiterId ? `staff:${inv.waiterId}` : inv.waiterUserId ? `user:${inv.waiterUserId}` : null;
      if (!key) continue;
      const cur = waiterMap.get(key) ?? {
        waiterId: inv.waiterId,
        waiterUserId: inv.waiterUserId,
        name: key,
        sales: 0,
        tips: 0,
        count: 0,
      };
      cur.sales += Number(inv.total);
      cur.tips += Number(inv.tipAmount);
      cur.count += 1;
      waiterMap.set(key, cur);
    }

    if (waiterMap.size) {
      const staffIds = [...waiterMap.values()].map((w) => w.waiterId).filter((id): id is string => !!id);
      const userIds = [...waiterMap.values()].map((w) => w.waiterUserId).filter((id): id is string => !!id);
      const [staffRows, userRows] = await Promise.all([
        staffIds.length
          ? this.prisma.staff.findMany({ where: { branchId, id: { in: staffIds } }, select: { id: true, name: true } })
          : [],
        userIds.length
          ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
          : [],
      ]);
      const staffNameMap = new Map(staffRows.map((w) => [w.id, w.name]));
      const userNameMap = new Map(userRows.map((u) => [u.id, u.name]));
      for (const row of waiterMap.values()) {
        if (row.waiterId && staffNameMap.has(row.waiterId)) row.name = staffNameMap.get(row.waiterId)!;
        else if (row.waiterUserId && userNameMap.has(row.waiterUserId)) row.name = userNameMap.get(row.waiterUserId)!;
      }
    }

    const tipsByWaiter = [...waiterMap.values()].sort((a, b) => b.tips - a.tips);

    const voidedInvoices = await this.prisma.salesInvoice.findMany({
      where: { branchId, status: "voided", voidedAt: { gte: rangeStart, lt: rangeEnd } },
      include: { lines: true },
      orderBy: { voidedAt: "desc" },
    });
    const voidedTotal = voidedInvoices.reduce((s, i) => s + Number(i.total), 0);

    const fromDate = rangeStart.toISOString().slice(0, 10);
    const toDate = new Date(rangeEnd.getTime() - 1).toISOString().slice(0, 10);
    const isSingleDay = fromDate === toDate;

    return {
      date: fromDate,
      from: fromDate,
      to: toDate,
      isSingleDay,
      branchId,
      summary: {
        totalSales,
        totalTax,
        totalTips,
        invoiceCount: paidInvoices.length,
        ticketAverage: Math.round(ticketAvg),
        fiscalAccepted,
        fiscalContingency,
        cashSessionOpen: !!openSession,
        voidedCount: voidedInvoices.length,
        voidedTotal,
      },
      paymentsByMethod: byMethod,
      topProducts,
      salesByHour,
      tipsByWaiter,
      recentSales: paidInvoices.slice(-5).reverse().map((i) => ({
        id: i.id,
        total: Number(i.total),
        invoiceNumber: i.invoiceNumber,
        paidAt: i.paidAt,
        serviceType: i.serviceType,
      })),
      voidedOrders: voidedInvoices.map((i) => ({
        id: i.id,
        serviceType: i.serviceType,
        total: Number(i.total),
        voidedAt: i.voidedAt,
        label: buildOrderLabel(i),
        reason: extractVoidReason(i.notes),
        itemsSummary: i.lines
          .slice(0, 3)
          .map((line) => line.nameSnapshot)
          .join(", "),
      })),
    };
  }

  async getVoidedOrdersReport(branchId: string, dateStr?: string) {
    const day = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const voidedInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        status: "voided",
        voidedAt: { gte: day, lt: dayEnd },
      },
      include: { lines: true },
      orderBy: { voidedAt: "desc" },
    });

    const totalValue = voidedInvoices.reduce((s, i) => s + Number(i.total), 0);

    return {
      date: day.toISOString().slice(0, 10),
      branchId,
      summary: {
        count: voidedInvoices.length,
        totalValue,
      },
      orders: voidedInvoices.map((i) => ({
        id: i.id,
        serviceType: i.serviceType,
        total: Number(i.total),
        voidedAt: i.voidedAt,
        label: buildOrderLabel(i),
        reason: extractVoidReason(i.notes),
        itemsSummary: i.lines
          .slice(0, 3)
          .map((line) => line.nameSnapshot)
          .join(", "),
      })),
    };
  }

  async getTableServiceTimes(branchId: string, dateStr?: string) {
    const day = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
    day.setHours(0, 0, 0, 0);
    const dayEnd = new Date(day);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const served = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        serviceType: "dine_in",
        tableReadyNotifiedAt: { not: null },
        tableReadyServedAt: { not: null, gte: day, lt: dayEnd },
      },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
      orderBy: { tableReadyServedAt: "desc" },
    });

    const waiterIds = [...new Set(served.map((i) => i.waiterId).filter((id): id is string => !!id))];
    const waiters = waiterIds.length
      ? await this.prisma.staff.findMany({
          where: { branchId, id: { in: waiterIds } },
          select: { id: true, name: true },
        })
      : [];
    const waiterMap = new Map(waiters.map((w) => [w.id, w.name]));

    const rows = served.map((invoice) => {
      const table = invoice.tableSession?.table;
      const tableLabel = table
        ? `${table.area?.name ?? ""} · Mesa ${table.name}`.trim()
        : "Mesa";
      const readyMs = invoice.tableReadyNotifiedAt!.getTime();
      const servedMs = invoice.tableReadyServedAt!.getTime();
      const waitMinutes = Math.max(0, Math.round((servedMs - readyMs) / 60000));

      return {
        invoiceId: invoice.id,
        tableLabel,
        waiterId: invoice.waiterId ?? null,
        waiterName: invoice.waiterId ? waiterMap.get(invoice.waiterId) ?? "Mesero" : "Mesero",
        readyAt: invoice.tableReadyNotifiedAt,
        servedAt: invoice.tableReadyServedAt,
        waitMinutes,
        itemsSummary: invoice.lines.slice(0, 3).map((l) => l.nameSnapshot).join(", "),
      };
    });

    const waitList = rows.map((r) => r.waitMinutes);
    const avgWaitMinutes = waitList.length
      ? Math.round(waitList.reduce((a, b) => a + b, 0) / waitList.length)
      : 0;
    const maxWaitMinutes = waitList.length ? Math.max(...waitList) : 0;
    const minWaitMinutes = waitList.length ? Math.min(...waitList) : 0;

    const byWaiterMap = new Map<string, { waiterName: string; count: number; avgWaitMinutes: number; totalWait: number }>();
    for (const row of rows) {
      const cur = byWaiterMap.get(row.waiterName) ?? {
        waiterName: row.waiterName,
        count: 0,
        avgWaitMinutes: 0,
        totalWait: 0,
      };
      cur.count += 1;
      cur.totalWait += row.waitMinutes;
      byWaiterMap.set(row.waiterName, cur);
    }
    const byWaiter = [...byWaiterMap.values()]
      .map((w) => ({
        waiterName: w.waiterName,
        count: w.count,
        avgWaitMinutes: Math.round(w.totalWait / w.count),
      }))
      .sort((a, b) => b.count - a.count);

    const notificationSettings = await readBranchNotificationSettings(this.prisma, branchId);
    const slaMinutes = notificationSettings?.tableReadySlaMinutes ?? 8;
    const sla = this.buildSlaSummary(rows, slaMinutes);
    const slaByWaiter = this.buildSlaByWaiter(rows, slaMinutes);

    return {
      date: day.toISOString().slice(0, 10),
      summary: {
        servedCount: rows.length,
        avgWaitMinutes,
        minWaitMinutes,
        maxWaitMinutes,
        sla,
      },
      byWaiter,
      slaByWaiter,
      rows,
    };
  }

  async exportTableServiceTimes(branchId: string, format: "csv" | "html", dateStr?: string) {
    const report = await this.getTableServiceTimes(branchId, dateStr);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const payload = {
      date: report.date,
      branchName: branch?.name ?? "Sucursal",
      summary: report.summary,
      byWaiter: report.byWaiter,
      rows: report.rows.map((row) => ({
        tableLabel: row.tableLabel,
        waiterName: row.waiterName,
        readyAt: row.readyAt!,
        servedAt: row.servedAt!,
        waitMinutes: row.waitMinutes,
        itemsSummary: row.itemsSummary,
      })),
    };

    if (format === "html") {
      return { contentType: "text/html; charset=utf-8", body: buildTableServiceTimesHtml(payload), filename: null };
    }

    return {
      contentType: "text/csv; charset=utf-8",
      body: buildTableServiceTimesCsv(payload),
      filename: `tiempos-mesa-${report.date}.csv`,
    };
  }

  async getTableServiceTimesWeekly(branchId: string, weekStartStr?: string) {
    const weekStart = weekStartStr ? new Date(`${weekStartStr}T00:00:00`) : getWeekStartMonday();
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const served = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        serviceType: "dine_in",
        tableReadyNotifiedAt: { not: null },
        tableReadyServedAt: { not: null, gte: weekStart, lt: weekEnd },
      },
      include: {
        lines: true,
        tableSession: { include: { table: { include: { area: true } } } },
      },
      orderBy: { tableReadyServedAt: "asc" },
    });

    type Row = {
      date: string;
      shift: ServiceShift;
      waitMinutes: number;
      waiterId: string | null;
      waiterName: string;
    };

    const waiterIds = [...new Set(served.map((i) => i.waiterId).filter((id): id is string => !!id))];
    const waiters = waiterIds.length
      ? await this.prisma.staff.findMany({
          where: { branchId, id: { in: waiterIds } },
          select: { id: true, name: true },
        })
      : [];
    const waiterMap = new Map(waiters.map((w) => [w.id, w.name]));

    const rows: Row[] = served.map((invoice) => {
      const readyMs = invoice.tableReadyNotifiedAt!.getTime();
      const servedMs = invoice.tableReadyServedAt!.getTime();
      const servedAt = invoice.tableReadyServedAt!;
      return {
        date: servedAt.toISOString().slice(0, 10),
        shift: getServiceShift(servedAt),
        waitMinutes: Math.max(0, Math.round((servedMs - readyMs) / 60000)),
        waiterId: invoice.waiterId ?? null,
        waiterName: invoice.waiterId ? waiterMap.get(invoice.waiterId) ?? "Mesero" : "Mesero",
      };
    });

    const waitList = rows.map((r) => r.waitMinutes);
    const summary = {
      servedCount: rows.length,
      avgWaitMinutes: waitList.length
        ? Math.round(waitList.reduce((a, b) => a + b, 0) / waitList.length)
        : 0,
      minWaitMinutes: waitList.length ? Math.min(...waitList) : 0,
      maxWaitMinutes: waitList.length ? Math.max(...waitList) : 0,
    };

    const shiftKeys: ServiceShift[] = ["almuerzo", "cena", "otro"];
    const byShift = shiftKeys.map((shift) => {
      const list = rows.filter((r) => r.shift === shift);
      const totalWait = list.reduce((sum, row) => sum + row.waitMinutes, 0);
      return {
        shift,
        shiftLabel: SERVICE_SHIFT_LABELS[shift],
        servedCount: list.length,
        avgWaitMinutes: list.length ? Math.round(totalWait / list.length) : 0,
      };
    }).filter((row) => row.servedCount > 0);

    const byDayMap = new Map<string, Row[]>();
    for (const row of rows) {
      const list = byDayMap.get(row.date) ?? [];
      list.push(row);
      byDayMap.set(row.date, list);
    }

    const byDay = [...byDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayRows]) => {
        const dayWait = dayRows.reduce((sum, row) => sum + row.waitMinutes, 0);
        const dayShifts = shiftKeys
          .map((shift) => {
            const list = dayRows.filter((r) => r.shift === shift);
            const totalWait = list.reduce((sum, row) => sum + row.waitMinutes, 0);
            return {
              shift,
              shiftLabel: SERVICE_SHIFT_LABELS[shift],
              servedCount: list.length,
              avgWaitMinutes: list.length ? Math.round(totalWait / list.length) : 0,
            };
          })
          .filter((row) => row.servedCount > 0);

        return {
          date,
          servedCount: dayRows.length,
          avgWaitMinutes: dayRows.length ? Math.round(dayWait / dayRows.length) : 0,
          byShift: dayShifts,
        };
      });

    const weekEndLabel = new Date(weekEnd);
    weekEndLabel.setDate(weekEndLabel.getDate() - 1);

    const notificationSettings = await readBranchNotificationSettings(this.prisma, branchId);
    const slaMinutes = notificationSettings?.tableReadySlaMinutes ?? 8;
    const sla = this.buildSlaSummary(
      rows.map((row) => ({ waitMinutes: row.waitMinutes })),
      slaMinutes,
    );
    const slaByWaiter = this.buildSlaByWaiter(rows, slaMinutes);

    const weekStartIso = weekStart.toISOString().slice(0, 10);
    const weekEndIso = weekEndLabel.toISOString().slice(0, 10);

    const slaAlert = await this.orderNotify.tryNotifyWeeklySlaBreach(branchId, {
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      avgWaitMinutes: summary.avgWaitMinutes,
      servedCount: summary.servedCount,
      withinSlaCount: sla.withinSlaCount,
      compliancePct: sla.compliancePct,
    });

    return {
      weekStart: weekStartIso,
      weekEnd: weekEndIso,
      summary: {
        ...summary,
        sla,
      },
      slaAlert,
      byShift,
      byDay,
      slaByWaiter,
    };
  }

  async exportTableServiceTimesWeekly(branchId: string, format: "csv" | "html", weekStartStr?: string) {
    const report = await this.getTableServiceTimesWeekly(branchId, weekStartStr);
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    const payload = {
      ...report,
      branchName: branch?.name ?? "Sucursal",
    };

    if (format === "html") {
      return {
        contentType: "text/html; charset=utf-8",
        body: buildTableServiceTimesWeeklyHtml(payload),
        filename: null,
      };
    }

    return {
      contentType: "text/csv; charset=utf-8",
      body: buildTableServiceTimesWeeklyCsv(payload),
      filename: `tiempos-mesa-semana-${report.weekStart}.csv`,
    };
  }

  async getCashReport(branchId: string, sessionId?: string) {
    const session = sessionId
      ? await this.prisma.posSession.findFirst({
          where: { id: sessionId, branchId },
          include: { movements: true, cashRegister: true },
        })
      : await this.prisma.posSession.findFirst({
          where: { branchId, status: "open" },
          orderBy: { openedAt: "desc" },
          include: { movements: true, cashRegister: true },
        });

    if (!session) return { message: "No hay sesión de caja" };

    const invoices = await this.prisma.salesInvoice.findMany({
      where: { sessionId: session.id, status: "paid" },
      include: { payments: true },
    });

    const totalSales = invoices.reduce((s, i) => s + Number(i.total), 0);
    const byMethod: Record<string, number> = {};
    for (const inv of invoices) {
      for (const p of inv.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
    }

    const cashIn = byMethod.cash ?? 0;
    let deposits = 0;
    let withdrawals = 0;
    let expenses = 0;
    for (const m of session.movements) {
      const amt = Number(m.amount);
      if (m.type === "deposit") deposits += amt;
      else if (m.type === "withdrawal") withdrawals += amt;
      else if (m.type === "expense") expenses += amt;
    }
    const expectedCash =
      session.status === "closed"
        ? Number(session.expectedCash)
        : Number(session.openingCash) + cashIn + deposits - withdrawals - expenses;

    return {
      sessionId: session.id,
      status: session.status,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingCash: Number(session.openingCash),
      cashRegisterId: session.cashRegisterId,
      cashRegisterName: session.cashRegister?.name ?? null,
      totalSales,
      invoiceCount: invoices.length,
      paymentsByMethod: byMethod,
      cashSales: cashIn,
      deposits,
      withdrawals,
      expenses,
      expectedCash,
      closingCash: session.closedAt ? Number(session.closingCash) : null,
      difference: session.closedAt ? Number(session.cashDifference) : null,
      movements: session.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: Number(m.amount),
        reason: m.reason,
        createdAt: m.createdAt,
      })),
    };
  }
}
