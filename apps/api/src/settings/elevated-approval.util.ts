import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { KioskSettings, verifyAdminPin, verifyPin } from "../common/pin.util";
import { verifyTotpCode } from "../common/totp.util";

export type ApprovalAction =
  | "discount"
  | "void_invoice"
  | "void_line"
  | "courtesy";

export type BranchApprovalPolicy = {
  maxDiscountPercentWithoutPin: number;
  requireApprovalVoidInvoice: boolean;
  requireApprovalVoidLine: boolean;
};

export type ElevatedApprovalInput = {
  approvalPin?: string;
  approvalTotp?: string;
};

export type ElevatedApprovalResult = {
  approverName: string;
  method: "pin" | "totp" | "kiosk_admin";
  approverUserId?: string;
};

async function readKiosk(prisma: PrismaService, branchId: string): Promise<KioskSettings> {
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

export async function readBranchApprovalPolicy(
  prisma: PrismaService,
  branchId: string,
): Promise<BranchApprovalPolicy> {
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) {
    return {
      maxDiscountPercentWithoutPin: 10,
      requireApprovalVoidInvoice: true,
      requireApprovalVoidLine: true,
    };
  }

  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = (settings.branches ?? {}) as Record<string, unknown>;
  const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
  const pos = (branchSettings.pos ?? {}) as Record<string, unknown>;
  const max = Number(pos.maxDiscountPercentWithoutPin);

  return {
    maxDiscountPercentWithoutPin:
      Number.isFinite(max) && max >= 0 && max <= 100 ? max : 10,
    requireApprovalVoidInvoice: pos.requireApprovalVoidInvoice !== false,
    requireApprovalVoidLine: pos.requireApprovalVoidLine !== false,
  };
}

export async function verifyElevatedApproval(
  prisma: PrismaService,
  branchId: string,
  tenantId: string,
  input: ElevatedApprovalInput,
): Promise<ElevatedApprovalResult> {
  const pin = input.approvalPin?.trim();
  const totp = input.approvalTotp?.trim();

  if (!pin && !totp) {
    throw new ForbiddenException({
      code: "APPROVAL_REQUIRED",
      message: "Se requiere PIN de gerente o código del autenticador",
    });
  }

  if (pin) {
    const kiosk = await readKiosk(prisma, branchId);
    if (verifyAdminPin(pin, kiosk)) {
      return { approverName: "Administrador (PIN kiosk)", method: "kiosk_admin" };
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
        return { approverName: row.name, method: "pin" };
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
        return { approverName: row.name, method: "pin", approverUserId: row.id };
      }
    }
  }

  if (totp) {
    const users = await prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        role: { in: ["manager", "owner"] },
        totpEnabled: true,
        totpSecret: { not: null },
      },
      select: { id: true, name: true, totpSecret: true },
    });
    for (const row of users) {
      if (verifyTotpCode(totp, row.totpSecret)) {
        return { approverName: row.name, method: "totp", approverUserId: row.id };
      }
    }
  }

  throw new UnauthorizedException({
    code: "APPROVAL_INVALID",
    message: "PIN o código de autenticador incorrecto",
  });
}

export function discountPercentRequiresApproval(
  discountPercent: number,
  maxWithoutPin: number,
): boolean {
  if (discountPercent <= 0) return false;
  return discountPercent > maxWithoutPin + 0.0001;
}
