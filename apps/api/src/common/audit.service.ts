import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: {
    tenantId: string;
    userId?: string;
    action: "create" | "update" | "delete";
    entity: string;
    entityId?: string;
    payload?: unknown;
    branchId?: string;
  }) {
    return this.prisma.auditLog.create({
      data: {
        tenantId: params.tenantId,
        userId: params.userId ?? null,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId ?? null,
        payload: {
          ...(params.payload && typeof params.payload === "object" ? (params.payload as object) : { value: params.payload }),
          ...(params.branchId ? { branchId: params.branchId } : {}),
        },
      },
    });
  }

  async list(tenantId: string, limit = 50) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      take: Math.min(limit, 200),
    });
  }
}
