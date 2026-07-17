import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ClockShiftDto } from "./dto/clock-shift.dto";
import { CreateStaffScheduleDto } from "./dto/create-staff-schedule.dto";
import { UpdateStaffScheduleDto } from "./dto/update-staff-schedule.dto";

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

function toDateOnly(dateStr: string) {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

function dateOnlyISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function hoursBetween(from: Date, to: Date) {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100;
}

function parseHm(hm: string) {
  const [h, m] = hm.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) {
    throw new BadRequestException("Hora inválida (usa HH:mm)");
  }
  return h * 60 + m;
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

  private async enrich(rows: { userId: string; staffId?: string | null }[]) {
    const userIds = [...new Set(rows.map((s) => s.userId))];
    const staffIds = [...new Set(rows.map((s) => s.staffId).filter((id): id is string => !!id))];
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

  async listSchedules(branchId: string, from?: string, to?: string, userId?: string) {
    const fromDate = toDateOnly(from ?? dateOnlyISO(new Date()));
    const toExclusive = parseDayEnd(to ?? from ?? dateOnlyISO(new Date()));
    const schedules = await this.prisma.staffSchedule.findMany({
      where: {
        branchId,
        ...(userId ? { userId } : {}),
        workDate: { gte: fromDate, lt: toExclusive },
      },
      orderBy: [{ workDate: "asc" }, { startTime: "asc" }],
      take: 500,
    });

    const { userMap } = await this.enrich(schedules);
    return {
      from: dateOnlyISO(fromDate),
      to: dateOnlyISO(new Date(toExclusive.getTime() - 86_400_000)),
      schedules: schedules.map((s) => ({
        id: s.id,
        userId: s.userId,
        userName: userMap.get(s.userId)?.name ?? "Usuario",
        role: userMap.get(s.userId)?.role ?? null,
        workDate: dateOnlyISO(s.workDate),
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label,
        notes: s.notes,
      })),
    };
  }

  async createSchedule(branchId: string, dto: CreateStaffScheduleDto, createdBy: string) {
    parseHm(dto.startTime);
    parseHm(dto.endTime);
    if (parseHm(dto.endTime) <= parseHm(dto.startTime)) {
      throw new BadRequestException("La hora de fin debe ser posterior a la de inicio");
    }

    const user = await this.prisma.user.findFirst({
      where: { id: dto.userId, isActive: true },
    });
    if (!user) throw new BadRequestException("Usuario no válido");

    const staffId = await this.resolveStaffId(branchId, dto.userId);
    return this.prisma.staffSchedule.create({
      data: {
        branchId,
        userId: dto.userId,
        staffId,
        workDate: toDateOnly(dto.workDate),
        startTime: dto.startTime,
        endTime: dto.endTime,
        label: dto.label?.trim() || null,
        notes: dto.notes?.trim() || null,
        createdBy,
      },
    });
  }

  async updateSchedule(branchId: string, id: string, dto: UpdateStaffScheduleDto) {
    const existing = await this.prisma.staffSchedule.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException("Turno programado no encontrado");

    const startTime = dto.startTime ?? existing.startTime;
    const endTime = dto.endTime ?? existing.endTime;
    parseHm(startTime);
    parseHm(endTime);
    if (parseHm(endTime) <= parseHm(startTime)) {
      throw new BadRequestException("La hora de fin debe ser posterior a la de inicio");
    }

    return this.prisma.staffSchedule.update({
      where: { id },
      data: {
        ...(dto.workDate ? { workDate: toDateOnly(dto.workDate) } : {}),
        ...(dto.startTime ? { startTime: dto.startTime } : {}),
        ...(dto.endTime ? { endTime: dto.endTime } : {}),
        ...(dto.label !== undefined ? { label: dto.label?.trim() || null } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
      },
    });
  }

  async deleteSchedule(branchId: string, id: string) {
    const existing = await this.prisma.staffSchedule.findFirst({ where: { id, branchId } });
    if (!existing) throw new NotFoundException("Turno programado no encontrado");
    await this.prisma.staffSchedule.delete({ where: { id } });
    return { ok: true };
  }

  async getDayBoard(branchId: string, dateStr?: string) {
    const day = dateStr ?? dateOnlyISO(new Date());
    const fromDate = parseDayStart(day);
    const toDate = parseDayEnd(day);

    const [schedules, openShifts, dayShifts] = await Promise.all([
      this.prisma.staffSchedule.findMany({
        where: { branchId, workDate: toDateOnly(day) },
        orderBy: { startTime: "asc" },
      }),
      this.prisma.staffShift.findMany({
        where: { branchId, clockOutAt: null },
        orderBy: { clockInAt: "asc" },
      }),
      this.prisma.staffShift.findMany({
        where: { branchId, clockInAt: { gte: fromDate, lt: toDate } },
        orderBy: { clockInAt: "asc" },
      }),
    ]);

    const { userMap } = await this.enrich([...schedules, ...openShifts, ...dayShifts]);
    const presentIds = new Set(openShifts.map((s) => s.userId));
    const clockedIds = new Set(dayShifts.map((s) => s.userId));

    const scheduled = schedules.map((s) => {
      const present = presentIds.has(s.userId);
      const clockedInToday = clockedIds.has(s.userId);
      return {
        id: s.id,
        userId: s.userId,
        userName: userMap.get(s.userId)?.name ?? "Usuario",
        role: userMap.get(s.userId)?.role ?? null,
        workDate: day,
        startTime: s.startTime,
        endTime: s.endTime,
        label: s.label,
        status: present ? "present" : clockedInToday ? "left" : "missing",
      };
    });

    const now = new Date();
    const present = openShifts.map((s) => ({
      shiftId: s.id,
      userId: s.userId,
      userName: userMap.get(s.userId)?.name ?? "Usuario",
      role: userMap.get(s.userId)?.role ?? null,
      clockInAt: s.clockInAt,
      hours: hoursBetween(s.clockInAt, now),
      scheduled: schedules.some((sch) => sch.userId === s.userId),
    }));

    return {
      date: day,
      summary: {
        scheduledCount: scheduled.length,
        presentCount: present.length,
        missingCount: scheduled.filter((s) => s.status === "missing").length,
      },
      scheduled,
      present,
    };
  }

  /**
   * Marcación tipo reloj: valida que el usuario esté activo y alterna
   * llegada/salida según tenga o no un turno abierto.
   */
  async clockToggle(branchId: string, user: { id: string; name: string; isActive: boolean }) {
    if (!user.isActive) {
      throw new BadRequestException(
        `${user.name}: tu usuario está inactivo, no estás habilitado para trabajar. Contacta a tu gerente.`,
      );
    }

    const open = await this.prisma.staffShift.findFirst({
      where: { branchId, userId: user.id, clockOutAt: null },
      orderBy: { clockInAt: "desc" },
    });

    if (open) {
      const shift = await this.prisma.staffShift.update({
        where: { id: open.id },
        data: { clockOutAt: new Date() },
      });
      return {
        action: "clock-out" as const,
        userName: user.name,
        clockInAt: shift.clockInAt,
        clockOutAt: shift.clockOutAt,
        hours: hoursBetween(shift.clockInAt, shift.clockOutAt!),
      };
    }

    const staffId = await this.resolveStaffId(branchId, user.id);
    const shift = await this.prisma.staffShift.create({
      data: { branchId, userId: user.id, staffId },
    });
    return {
      action: "clock-in" as const,
      userName: user.name,
      clockInAt: shift.clockInAt,
    };
  }

  /** Fallback: identificar por PIN (equipos sin sensor de huella). */
  async findUserByPin(tenantId: string, pin: string) {
    const { verifyPin, isValidPinFormat } = await import("../common/pin.util");
    if (!isValidPinFormat(pin)) {
      throw new BadRequestException("PIN debe ser de 4 a 6 dígitos");
    }
    const users = await this.prisma.user.findMany({
      where: { tenantId, pinHash: { not: null } },
      select: { id: true, name: true, isActive: true, pinHash: true },
    });
    for (const row of users) {
      if (row.pinHash && verifyPin(pin, row.pinHash)) {
        return { id: row.id, name: row.name, isActive: row.isActive };
      }
    }
    throw new BadRequestException("PIN no reconocido");
  }

  async getMyAttendanceHome(branchId: string, userId: string) {
    const today = dateOnlyISO(new Date());
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);

    const [current, mySchedules] = await Promise.all([
      this.getCurrent(branchId, userId),
      this.listSchedules(branchId, today, dateOnlyISO(weekEnd), userId),
    ]);

    return {
      today,
      current,
      myUpcomingSchedules: mySchedules.schedules,
    };
  }
}
