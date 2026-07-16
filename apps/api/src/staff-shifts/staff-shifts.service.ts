import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClockShiftDto } from "./dto/clock-shift.dto";

function parseDayStart(dateStr?: string) {
  const d = dateStr ? new Date(`${dateStr}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayEnd(dateStr?: string) {
  const d = parseDayStart(dateStr);
  d.setDate(d.getDate() + 1);
  return d;
}

function hoursBetween(from: Date, to: Date) {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100;
}

@Injectable()
export class StaffShiftsService {
  constructor(private prisma: PrismaService) {}

  private async resolveStaffId(branchId: string, userId: string) {
    const staff = await this.prisma.staff.findFirst({
      where: { branchId, userId, isActive: true },
      select: { id: true },
    });
    return staff?.id ?? null;
  }

  private async enrich(shifts: { userId: string; staffId: string | null }[]) {
    const userIds = [...new Set(shifts.map((s) => s.userId))];
    const staffIds = [...new Set(shifts.map((s) => s.staffId).filter((id): id is string => !!id))];
    const [users, staffRows] = await Promise.all([
      userIds.length
        ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, role: true } })
        : [],
      staffIds.length
        ? this.prisma.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, name: true } })
        : [],
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const staffMap = new Map(staffRows.map((s) => [s.id, s]));
    return { userMap, staffMap };
  }

  async getCurrent(branchId: string, userId: string) {
    const shift = await this.prisma.staffShift.findFirst({
      where: { branchId, userId, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
    });
    if (!shift) return { open: false as const, shift: null };
    const { userMap } = await this.enrich([shift]);
    const user = userMap.get(shift.userId);
    return {
      open: true as const,
      shift: {
        id: shift.id,
        userId: shift.userId,
        userName: user?.name ?? "Usuario",
        role: user?.role ?? null,
        clockInAt: shift.clockInAt,
        notes: shift.notes,
        elapsedHours: hoursBetween(shift.clockInAt, new Date()),
      },
    };
  }

  async clockIn(branchId: string, userId: string, dto: ClockShiftDto) {
    const open = await this.prisma.staffShift.findFirst({
      where: { branchId, userId, clockOutAt: null },
    });
    if (open) throw new BadRequestException("Ya tienes un turno abierto en esta sucursal");

    const staffId = await this.resolveStaffId(branchId, userId);
    const shift = await this.prisma.staffShift.create({
      data: {
        branchId,
        userId,
        staffId,
        notes: dto.notes?.trim() || null,
      },
    });
    return this.getCurrent(branchId, userId).then((r) => ({ ...r, shiftId: shift.id }));
  }

  async clockOut(branchId: string, userId: string, dto: ClockShiftDto) {
    const open = await this.prisma.staffShift.findFirst({
      where: { branchId, userId, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
    });
    if (!open) throw new BadRequestException("No tienes un turno abierto");

    const notes = dto.notes?.trim()
      ? [open.notes, dto.notes.trim()].filter(Boolean).join(" | ")
      : open.notes;

    const shift = await this.prisma.staffShift.update({
      where: { id: open.id },
      data: { clockOutAt: new Date(), notes },
    });

    return {
      open: false as const,
      shift: {
        id: shift.id,
        clockInAt: shift.clockInAt,
        clockOutAt: shift.clockOutAt,
        hours: hoursBetween(shift.clockInAt, shift.clockOutAt!),
        notes: shift.notes,
      },
    };
  }

  /** Manager force-close any open shift */
  async forceClockOut(branchId: string, shiftId: string, dto: ClockShiftDto) {
    const open = await this.prisma.staffShift.findFirst({
      where: { id: shiftId, branchId, clockOutAt: null },
    });
    if (!open) throw new NotFoundException("Turno no encontrado o ya cerrado");

    const note = dto.notes?.trim() || "Cierre forzado por gerente";
    const notes = [open.notes, note].filter(Boolean).join(" | ");

    return this.prisma.staffShift.update({
      where: { id: shiftId },
      data: { clockOutAt: new Date(), notes },
    });
  }

  async list(branchId: string, from?: string, to?: string, userId?: string) {
    const fromDate = parseDayStart(from);
    const toDate = parseDayEnd(to ?? from);

    const shifts = await this.prisma.staffShift.findMany({
      where: {
        branchId,
        ...(userId ? { userId } : {}),
        clockInAt: { gte: fromDate, lt: toDate },
      },
      orderBy: { clockInAt: "desc" },
      take: 200,
    });

    const { userMap, staffMap } = await this.enrich(shifts);
    const now = new Date();

    const rows = shifts.map((s) => {
      const user = userMap.get(s.userId);
      const end = s.clockOutAt ?? now;
      return {
        id: s.id,
        userId: s.userId,
        userName: user?.name ?? staffMap.get(s.staffId ?? "")?.name ?? "Usuario",
        role: user?.role ?? null,
        staffId: s.staffId,
        clockInAt: s.clockInAt,
        clockOutAt: s.clockOutAt,
        open: !s.clockOutAt,
        hours: hoursBetween(s.clockInAt, end),
        notes: s.notes,
      };
    });

    const byUser = new Map<string, { userId: string; userName: string; hours: number; shifts: number; open: number }>();
    for (const row of rows) {
      const cur = byUser.get(row.userId) ?? {
        userId: row.userId,
        userName: row.userName,
        hours: 0,
        shifts: 0,
        open: 0,
      };
      cur.hours = Math.round((cur.hours + row.hours) * 100) / 100;
      cur.shifts += 1;
      if (row.open) cur.open += 1;
      byUser.set(row.userId, cur);
    }

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: new Date(toDate.getTime() - 1).toISOString().slice(0, 10),
      summary: {
        shiftCount: rows.length,
        openCount: rows.filter((r) => r.open).length,
        totalHours: Math.round(rows.reduce((s, r) => s + r.hours, 0) * 100) / 100,
      },
      byUser: [...byUser.values()].sort((a, b) => b.hours - a.hours),
      shifts: rows,
    };
  }
}
