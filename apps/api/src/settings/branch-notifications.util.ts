import { PrismaService } from "../prisma/prisma.service";

export type BranchNotificationSettings = {
  webhookUrl?: string;
  hostPhone?: string;
  tableReadyWarnMinutes: number;
  tableReadySlaMinutes: number;
  tableReadyHostWhatsAppEnabled: boolean;
  tableReadyWaiterWhatsAppEnabled: boolean;
  tableReadyOverdueWebhookEnabled: boolean;
  tableReadySlaWebhookEnabled: boolean;
  lastSlaAlertWeekStart?: string;
};

export async function readBranchNotificationSettings(
  prisma: PrismaService,
  branchId: string,
): Promise<BranchNotificationSettings | null> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) return null;

  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = (settings.branches ?? {}) as Record<string, unknown>;
  const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
  const notifications = (branchSettings.notifications ?? {}) as Record<string, unknown>;

  const warnMinutes = Number(notifications.tableReadyWarnMinutes);
  const slaMinutes = Number(notifications.tableReadySlaMinutes);

  return {
    webhookUrl: typeof notifications.webhookUrl === "string" ? notifications.webhookUrl : undefined,
    hostPhone: typeof notifications.hostPhone === "string" ? notifications.hostPhone : undefined,
    tableReadyWarnMinutes: Number.isFinite(warnMinutes) && warnMinutes > 0 ? warnMinutes : 10,
    tableReadySlaMinutes: Number.isFinite(slaMinutes) && slaMinutes > 0 ? slaMinutes : 8,
    tableReadyHostWhatsAppEnabled: notifications.tableReadyHostWhatsAppEnabled !== false,
    tableReadyWaiterWhatsAppEnabled: notifications.tableReadyWaiterWhatsAppEnabled !== false,
    tableReadyOverdueWebhookEnabled: notifications.tableReadyOverdueWebhookEnabled !== false,
    tableReadySlaWebhookEnabled: notifications.tableReadySlaWebhookEnabled !== false,
    lastSlaAlertWeekStart:
      typeof notifications.lastSlaAlertWeekStart === "string"
        ? notifications.lastSlaAlertWeekStart
        : undefined,
  };
}

export async function saveLastSlaAlertWeekStart(
  prisma: PrismaService,
  branchId: string,
  weekStart: string,
) {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) return;

  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = { ...((settings.branches ?? {}) as Record<string, unknown>) };
  const current = (branches[branchId] ?? {}) as Record<string, unknown>;
  const notifications = {
    ...((current.notifications ?? {}) as Record<string, unknown>),
    lastSlaAlertWeekStart: weekStart,
  };

  branches[branchId] = { ...current, notifications };
  await prisma.tenant.update({
    where: { id: branch.company.tenantId },
    data: { settings: { ...settings, branches } as object },
  });
}
