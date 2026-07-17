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

export type CustomPermission = {
  key: string;
  label: string;
  group: string;
  description?: string;
  custom: true;
};

@Injectable()
export class PermissionsService {
  constructor(private prisma: PrismaService) {}

  getCatalog() {
    return PERMISSION_CATALOG;
  }

  /** Catálogo del sistema + permisos personalizados del tenant. */
  async getCatalogForTenant(tenantId: string) {
    const custom = await this.getCustomPermissions(tenantId);
    return [
      ...PERMISSION_CATALOG.map((p) => ({ ...p, custom: false })),
      ...custom,
    ];
  }

  async getCustomPermissions(tenantId: string): Promise<CustomPermission[]> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    const list = Array.isArray(settings.customPermissions)
      ? (settings.customPermissions as CustomPermission[])
      : [];
    return list.filter((p) => p && typeof p.key === "string");
  }

  async addCustomPermission(
    tenantId: string,
    input: { label: string; group?: string; description?: string },
  ): Promise<CustomPermission> {
    const label = input.label?.trim();
    if (!label) throw new Error("PERMISSION_LABEL_REQUIRED");

    const slug = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) throw new Error("PERMISSION_LABEL_INVALID");

    const key = `custom.${slug}`;
    if (ALL_PERMISSION_KEYS.includes(key)) throw new Error("PERMISSION_EXISTS");

    const existing = await this.getCustomPermissions(tenantId);
    if (existing.some((p) => p.key === key)) throw new Error("PERMISSION_EXISTS");

    const perm: CustomPermission = {
      key,
      label,
      group: input.group?.trim() || "Personalizados",
      description: input.description?.trim() || undefined,
      custom: true,
    };
    await this.persistCustomPermissions(tenantId, [...existing, perm]);
    return perm;
  }

  async removeCustomPermission(tenantId: string, key: string) {
    const existing = await this.getCustomPermissions(tenantId);
    const next = existing.filter((p) => p.key !== key);
    if (next.length === existing.length) return { ok: false };
    await this.persistCustomPermissions(tenantId, next);

    // Quita el permiso de cualquier rol que lo tuviera asignado.
    const roles = await this.prisma.tenantRole.findMany({
      where: { tenantId, permissions: { has: key } },
      select: { id: true, permissions: true },
    });
    for (const r of roles) {
      await this.prisma.tenantRole.update({
        where: { id: r.id },
        data: { permissions: r.permissions.filter((p) => p !== key) },
      });
    }
    return { ok: true };
  }

  private async persistCustomPermissions(tenantId: string, list: CustomPermission[]) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { settings: true },
    });
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, customPermissions: list } as object },
    });
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
        // Roles de sistema: se sincronizan con la plantilla (nombre, descripción, permisos).
        // Roles custom del tenant no se tocan.
        update: {
          name: tpl.name,
          description: tpl.description,
          permissions: tpl.permissions,
          legacyRole: tpl.legacyRole,
          isSystem: true,
          isActive: true,
        },
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

  /** Como sanitizePermissions pero acepta también los permisos custom del tenant. */
  async sanitizePermissionsForTenant(tenantId: string, input: string[] | undefined): Promise<string[]> {
    if (!input?.length) return [];
    if (input.includes("*")) return ["*"];
    const custom = await this.getCustomPermissions(tenantId);
    const allowed = new Set([...ALL_PERMISSION_KEYS, ...custom.map((p) => p.key)]);
    return [...new Set(input.filter((p) => allowed.has(p)))];
  }
}
