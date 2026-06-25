import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { AuthUser } from "./auth.types";
import { PermissionsService } from "./permissions.service";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private permissions: PermissionsService,
  ) {}

  private hashPassword(password: string, salt?: string): { hash: string; salt: string } {
    const s = salt ?? randomBytes(16).toString("hex");
    const hash = createHash("sha256").update(`${s}:${password}`).digest("hex");
    return { hash, salt: s };
  }

  private verifyPassword(password: string, stored: string): boolean {
    const [salt, hash] = stored.split(":");
    if (!salt || !hash) return false;
    const { hash: computed } = this.hashPassword(password, salt);
    try {
      return timingSafeEqual(Buffer.from(computed), Buffer.from(hash));
    } catch {
      return false;
    }
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findFirst({
      where: { email, isActive: true },
      include: { tenant: true },
    });
    if (!user || !this.verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException("Credenciales inválidas");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    await this.permissions.ensureDefaultRoles(user.tenantId);
    const authUser = await this.permissions.resolveAuthUser(user.id);
    if (!authUser) throw new UnauthorizedException("Credenciales inválidas");

    const token = Buffer.from(`${user.id}:${Date.now()}:${randomBytes(8).toString("hex")}`).toString("base64url");

    return {
      token,
      user: {
        id: authUser.id,
        email: authUser.email,
        name: authUser.name,
        role: authUser.role,
        roleId: authUser.roleId,
        roleName: authUser.roleName,
        permissions: authUser.permissions,
        tenantId: authUser.tenantId,
        tenantName: authUser.tenantName,
      },
    };
  }

  async registerTenant(dto: {
    tenantName: string;
    slug: string;
    ownerName: string;
    email: string;
    password: string;
    companyName: string;
    vertical: "restaurant" | "bakery" | "cafe";
  }) {
    const existing = await this.prisma.tenant.findUnique({ where: { slug: dto.slug } });
    if (existing) throw new UnauthorizedException("El slug ya está en uso");

    const { hash, salt } = this.hashPassword(dto.password);

    return this.prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: dto.tenantName, slug: dto.slug },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          name: dto.ownerName,
          role: "owner",
          passwordHash: `${salt}:${hash}`,
        },
      });

      const company = await tx.company.create({
        data: {
          tenantId: tenant.id,
          name: dto.companyName,
          vertical: dto.vertical,
        },
      });

      return { tenant, user: { id: user.id, email: user.email }, company };
    }).then(async (result) => {
      await this.permissions.ensureDefaultRoles(result.tenant.id);
      const ownerRole = await this.prisma.tenantRole.findFirst({
        where: { tenantId: result.tenant.id, slug: "owner" },
      });
      if (ownerRole) {
        await this.prisma.user.update({
          where: { id: result.user.id },
          data: { roleId: ownerRole.id },
        });
      }
      return result;
    });
  }

  formatPasswordHash(password: string): string {
    const { hash, salt } = this.hashPassword(password);
    return `${salt}:${hash}`;
  }

  async validateToken(token: string): Promise<AuthUser | null> {
    try {
      const decoded = Buffer.from(token, "base64url").toString("utf8");
      const [userId] = decoded.split(":");
      if (!userId) return null;
      return this.permissions.resolveAuthUser(userId);
    } catch {
      return null;
    }
  }

  async assertBranchAccess(tenantId: string, branchId: string): Promise<void> {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, company: { tenantId } },
    });
    if (!branch) throw new ForbiddenException("Sucursal no autorizada");
  }
}
