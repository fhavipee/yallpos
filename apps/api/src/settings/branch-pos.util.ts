import { UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { KioskSettings, verifyAdminPin, verifyPin } from "../common/pin.util";

export type KitchenSendMode = "manual" | "auto";

export type BranchPosSettings = {
  maxDiscountPercentWithoutPin: number;
  /** manual: productos quedan pendientes hasta "Enviar a cocina". auto: cada producto va al KDS al agregarlo. */
  kitchenSendMode: KitchenSendMode;
};

export async function readBranchPosSettings(
  prisma: PrismaService,
  branchId: string,
): Promise<BranchPosSettings> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) {
    return { maxDiscountPercentWithoutPin: 10, kitchenSendMode: "manual" };
  }

  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = (settings.branches ?? {}) as Record<string, unknown>;
  const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
  const pos = (branchSettings.pos ?? {}) as Record<string, unknown>;
  const max = Number(pos.maxDiscountPercentWithoutPin);
  const mode = pos.kitchenSendMode === "auto" ? "auto" : "manual";

  return {
    maxDiscountPercentWithoutPin:
      Number.isFinite(max) && max >= 0 && max <= 100 ? max : 10,
    kitchenSendMode: mode,
  };
}

export async function readBranchKioskSettings(
  prisma: PrismaService,
  branchId: string,
): Promise<KioskSettings> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) return {};
  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = (settings.branches ?? {}) as Record<string, unknown>;
  const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
  return (branchSettings.kiosk ?? {}) as KioskSettings;
}

export async function verifyDiscountApprovalPin(
  prisma: PrismaService,
  branchId: string,
  tenantId: string,
  pin: string,
): Promise<{ approverName: string }> {
  const kiosk = await readBranchKioskSettings(prisma, branchId);
  if (verifyAdminPin(pin, kiosk)) {
    return { approverName: "Administrador" };
  }

  const staff = await prisma.staff.findMany({
    where: {
      branchId,
      isActive: true,
      role: "manager",
      pinHash: { not: null },
    },
    select: { id: true, name: true, pinHash: true },
  });
  for (const row of staff) {
    if (row.pinHash && verifyPin(pin, row.pinHash)) {
      return { approverName: row.name };
    }
  }

  const users = await prisma.user.findMany({
    where: {
      tenantId,
      isActive: true,
      role: { in: ["manager", "owner"] },
      pinHash: { not: null },
    },
    select: { id: true, name: true, pinHash: true },
  });
  for (const row of users) {
    if (row.pinHash && verifyPin(pin, row.pinHash)) {
      return { approverName: row.name };
    }
  }

  throw new UnauthorizedException("PIN de autorización incorrecto");
}

export function discountPercentRequiresApproval(
  discountPercent: number,
  maxWithoutPin: number,
): boolean {
  if (discountPercent <= 0) return false;
  return discountPercent > maxWithoutPin + 0.0001;
}
