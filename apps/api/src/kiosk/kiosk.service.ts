import { BadRequestException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  isValidPinFormat,
  KioskSettings,
  sanitizeKioskForClient,
  verifyAdminPin,
  verifyPin,
} from "../common/pin.util";

@Injectable()
export class KioskService {
  constructor(private prisma: PrismaService) {}

  private async branchKioskSettings(branchId: string): Promise<KioskSettings> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new BadRequestException("Sucursal no encontrada");
    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
    return (branchSettings.kiosk ?? {}) as KioskSettings;
  }

  async verifyPin(branchId: string, tenantId: string, pin: string, type: "admin" | "waiter") {
    if (!isValidPinFormat(pin)) {
      throw new BadRequestException("PIN debe ser de 4 a 6 dígitos numéricos");
    }

    if (type === "admin") {
      const kiosk = await this.branchKioskSettings(branchId);
      if (!verifyAdminPin(pin, kiosk)) {
        throw new UnauthorizedException("PIN de administrador incorrecto");
      }
      return { ok: true, type: "admin" as const };
    }

    const staff = await this.prisma.staff.findMany({
      where: { branchId, isActive: true, pinHash: { not: null } },
      select: { id: true, name: true, role: true, pinHash: true },
    });
    for (const row of staff) {
      if (row.pinHash && verifyPin(pin, row.pinHash)) {
        return {
          ok: true,
          type: "waiter" as const,
          kind: "staff" as const,
          id: row.id,
          name: row.name,
          role: row.role,
        };
      }
    }

    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        pinHash: { not: null },
        role: { in: ["waiter", "cashier", "manager", "owner"] },
      },
      select: { id: true, name: true, role: true, pinHash: true },
    });
    for (const row of users) {
      if (row.pinHash && verifyPin(pin, row.pinHash)) {
        return {
          ok: true,
          type: "waiter" as const,
          kind: "user" as const,
          id: row.id,
          name: row.name,
          role: row.role,
        };
      }
    }

    throw new UnauthorizedException("PIN de mesero incorrecto");
  }

  sanitizeBranchSettings(branchSettings: Record<string, unknown>) {
    const kiosk = (branchSettings.kiosk ?? {}) as KioskSettings;
    return {
      ...branchSettings,
      kiosk: sanitizeKioskForClient(kiosk),
    };
  }
}
