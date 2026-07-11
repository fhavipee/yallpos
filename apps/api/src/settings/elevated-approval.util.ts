import { ForbiddenException, HttpException, HttpStatus, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { KioskSettings, verifyAdminPin, verifyPin } from "../common/pin.util";
import { verifyTotpCode } from "../common/totp.util";

export type ApprovalMethodMode = "pin" | "totp" | "both";

export type BranchApprovalPolicy = {
  maxDiscountPercentWithoutPin: number;
  requireApprovalVoidInvoice: boolean;
  requireApprovalVoidLine: boolean;
  /** Qué métodos de autorización están habilitados en caja */
  approvalMethod: ApprovalMethodMode;
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

function parseApprovalMethod(raw: unknown): ApprovalMethodMode {
  if (raw === "pin" || raw === "totp" || raw === "both") return raw;
  return "both";
}

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
      approvalMethod: "both",
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
    approvalMethod: parseApprovalMethod(pos.approvalMethod),
  };
}

export async function verifyElevatedApproval(
  prisma: PrismaService,
  branchId: string,
  tenantId: string,
  input: ElevatedApprovalInput,
): Promise<ElevatedApprovalResult> {
  const policy = await readBranchApprovalPolicy(prisma, branchId);
  const allowPin = policy.approvalMethod === "pin" || policy.approvalMethod === "both";
  const allowTotp = policy.approvalMethod === "totp" || policy.approvalMethod === "both";

  const pin = allowPin ? input.approvalPin?.trim() : undefined;
  const totp = allowTotp ? input.approvalTotp?.trim() : undefined;

  if (!pin && !totp) {
    const msg =
      policy.approvalMethod === "pin"
        ? "Se requiere PIN de gerente"
        : policy.approvalMethod === "totp"
          ? "Se requiere código del autenticador"
          : "Se requiere PIN de gerente o código del autenticador";
    throw new ForbiddenException({
      code: "APPROVAL_REQUIRED",
      message: msg,
      approvalMethod: policy.approvalMethod,
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
    if (users.length === 0) {
      throw new HttpException(
        {
          code: "APPROVAL_INVALID",
          message:
            "Ningún gerente tiene el autenticador activo. En Ajustes → Autenticador: genera el QR, escanea, y pulsa Confirmar con el código de 6 dígitos.",
        },
        HttpStatus.UNAUTHORIZED,
      );
    }
    for (const row of users) {
      if (verifyTotpCode(totp, row.totpSecret)) {
        return { approverName: row.name, method: "totp", approverUserId: row.id };
      }
    }
    throw new HttpException(
      {
        code: "APPROVAL_INVALID",
        message:
          "Código de autenticador incorrecto o vencido. Usa el código actual (cambia cada 30s). Si regeneraste el QR, elimina la cuenta vieja en la app y vuelve a escanear.",
      },
      HttpStatus.UNAUTHORIZED,
    );
  }

  throw new HttpException(
    {
      code: "APPROVAL_INVALID",
      message:
        policy.approvalMethod === "totp"
          ? "Código de autenticador incorrecto"
          : policy.approvalMethod === "pin"
            ? "PIN de autorización incorrecto"
            : "PIN o código de autenticador incorrecto",
    },
    HttpStatus.UNAUTHORIZED,
  );
}

export function discountPercentRequiresApproval(
  discountPercent: number,
  maxWithoutPin: number,
): boolean {
  if (discountPercent <= 0) return false;
  return discountPercent > maxWithoutPin + 0.0001;
}
