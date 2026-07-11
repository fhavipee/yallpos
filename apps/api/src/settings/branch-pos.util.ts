import { PrismaService } from "../prisma/prisma.service";
import { KioskSettings } from "../common/pin.util";
import {
  discountPercentRequiresApproval,
  readBranchApprovalPolicy,
  verifyElevatedApproval,
} from "./elevated-approval.util";

export type KitchenSendMode = "manual" | "auto";

export type BranchPosSettings = {
  maxDiscountPercentWithoutPin: number;
  /** manual: productos quedan pendientes hasta "Enviar a cocina". auto: cada producto va al KDS al agregarlo. */
  kitchenSendMode: KitchenSendMode;
  requireApprovalVoidInvoice: boolean;
  requireApprovalVoidLine: boolean;
  approvalMethod: "pin" | "totp" | "both";
};

export async function readBranchPosSettings(
  prisma: PrismaService,
  branchId: string,
): Promise<BranchPosSettings> {
  const approval = await readBranchApprovalPolicy(prisma, branchId);
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    include: { company: { include: { tenant: true } } },
  });
  if (!branch) {
    return {
      ...approval,
      kitchenSendMode: "manual",
    };
  }

  const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
  const branches = (settings.branches ?? {}) as Record<string, unknown>;
  const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
  const pos = (branchSettings.pos ?? {}) as Record<string, unknown>;
  const mode = pos.kitchenSendMode === "auto" ? "auto" : "manual";

  return {
    ...approval,
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

/** @deprecated use verifyElevatedApproval — se mantiene para compatibilidad */
export async function verifyDiscountApprovalPin(
  prisma: PrismaService,
  branchId: string,
  tenantId: string,
  pin: string,
): Promise<{ approverName: string }> {
  const result = await verifyElevatedApproval(prisma, branchId, tenantId, { approvalPin: pin });
  return { approverName: result.approverName };
}

export { discountPercentRequiresApproval, verifyElevatedApproval };
