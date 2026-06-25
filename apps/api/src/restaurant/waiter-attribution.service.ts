import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

export type WaiterAttributionInput = {
  waiterId?: string;
  waiterStaffId?: string;
  waiterUserId?: string;
};

export type ResolvedWaiterAttribution = {
  waiterId: string | null;
  waiterUserId: string | null;
};

@Injectable()
export class WaiterAttributionService {
  constructor(private prisma: PrismaService) {}

  async resolve(
    branchId: string,
    tenantId: string,
    input: WaiterAttributionInput,
  ): Promise<ResolvedWaiterAttribution> {
    const staffId = input.waiterStaffId?.trim() || input.waiterId?.trim();
    const userId = input.waiterUserId?.trim();

    if (staffId && userId) {
      throw new BadRequestException("Indique solo mesero de piso o usuario, no ambos");
    }

    if (staffId) {
      const staff = await this.prisma.staff.findFirst({
        where: { id: staffId, branchId, isActive: true },
      });
      if (!staff) throw new BadRequestException("Mesero no encontrado");
      return { waiterId: staff.id, waiterUserId: staff.userId ?? null };
    }

    if (userId) {
      const user = await this.prisma.user.findFirst({
        where: { id: userId, tenantId, isActive: true },
      });
      if (!user) throw new BadRequestException("Usuario no encontrado");

      const linked = await this.prisma.staff.findFirst({
        where: { branchId, userId, isActive: true },
      });
      if (linked) {
        return { waiterId: linked.id, waiterUserId: userId };
      }
      return { waiterId: null, waiterUserId: userId };
    }

    throw new BadRequestException("Debe indicar un mesero");
  }

  async applyToOpenInvoices(
    branchId: string,
    tableSessionId: string,
    attribution: ResolvedWaiterAttribution,
  ) {
    const openInvoices = await this.prisma.salesInvoice.findMany({
      where: {
        branchId,
        tableSessionId,
        status: { in: ["draft", "sent_to_kitchen"] },
      },
      select: { id: true },
    });
    if (!openInvoices.length) return;

    const ids = openInvoices.map((i) => i.id);
    await this.prisma.salesInvoice.updateMany({
      where: { id: { in: ids } },
      data: {
        waiterId: attribution.waiterId,
        waiterUserId: attribution.waiterUserId,
      },
    });
    await this.prisma.kdsTicket.updateMany({
      where: { invoiceId: { in: ids } },
      data: { waiterId: attribution.waiterId },
    });
  }

  async resolveDisplayNames(
    branchId: string,
    tenantId: string,
    rows: { waiterId?: string | null; waiterUserId?: string | null }[],
  ) {
    const staffIds = [...new Set(rows.map((r) => r.waiterId).filter((id): id is string => !!id))];
    const userIds = [...new Set(rows.map((r) => r.waiterUserId).filter((id): id is string => !!id))];

    const [staff, users] = await Promise.all([
      staffIds.length
        ? this.prisma.staff.findMany({
            where: { branchId, id: { in: staffIds } },
            select: { id: true, name: true },
          })
        : [],
      userIds.length
        ? this.prisma.user.findMany({
            where: { tenantId, id: { in: userIds } },
            select: { id: true, name: true },
          })
        : [],
    ]);

    const staffMap = new Map(staff.map((s) => [s.id, s.name]));
    const userMap = new Map(users.map((u) => [u.id, u.name]));

    return (row: { waiterId?: string | null; waiterUserId?: string | null }) => {
      if (row.waiterId && staffMap.has(row.waiterId)) return staffMap.get(row.waiterId)!;
      if (row.waiterUserId && userMap.has(row.waiterUserId)) return userMap.get(row.waiterUserId)!;
      return "Mesero";
    };
  }
}
