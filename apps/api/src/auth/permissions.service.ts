import { Injectable } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import {
  ALL_PERMISSION_KEYS,
  PERMISSION_CATALOG,
  SYSTEM_ROLE_TEMPLATES,
  satisfiesLegacyRole,
} from "./permissions.constants";
import { AuthUser } from "./auth.types";

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  getCatalog() {
    return PERMISSION_CATALOG;
  }

  async ensureDefaultRoles(tenantId: string) {
    for (const tpl of SYSTEM_ROLE_TEMPLATES) {
      await this.prisma.tenantRole.upsert({
        where: { tenantId_slug: { tenantId, slug: tpl.slug } },
        create: {
          tenantId,
          slug: tpl.slug,
          name: tpl.name,
          description: tpl.description,
          permissions: tpl.permissions,
          legacyRole: tpl.legacyRole,
          isSystem: true,
          isActive: true,
        },
        update: {},
      });
    }

    await this.syncUsersWithoutRoleId(tenantId);
  }

  private async syncUsersWithoutRoleId(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: { tenantId, roleId: null },
      select: { id: true, role: true },
    });
    if (!users.length) return;

    const roles = await this.prisma.tenantRole.findMany({ where: { tenantId, isSystem: true } });
    for (const u of users) {
      const match = roles.find((r) => r.legacyRole === u.role);
      if (match) {
        await this.prisma.user.update({ where: { id: u.id }, data: { roleId: match.id } });
      }
    }
  }

  async resolveAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      include: { tenant: true, tenantRole: true },
    });
    if (!user) return null;

    let permissions = user.tenantRole?.permissions ?? [];
    if (!permissions.length) {
      const tpl = SYSTEM_ROLE_TEMPLATES.find((t) => t.legacyRole === user.role);
      permissions = tpl?.permissions ?? [];
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      roleId: user.roleId,
      roleName: user.tenantRole?.name ?? null,
      permissions,
      tenantId: user.tenantId,
      tenantName: user.tenant.name,
    };
  }

  userSatisfiesRole(user: AuthUser, requiredRole: UserRole): boolean {
    return satisfiesLegacyRole(user.permissions, requiredRole, user.role);
  }

  sanitizePermissions(input: string[] | undefined): string[] {
    if (!input?.length) return [];
    if (input.includes("*")) return ["*"];
    return [...new Set(input.filter((p) => ALL_PERMISSION_KEYS.includes(p)))];
  }
}
