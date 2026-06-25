import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import { PermissionsService } from "../auth/permissions.service";
import { hasPermission, SYSTEM_ROLE_TEMPLATES } from "../auth/permissions.constants";

const SYSTEM_ROLE_SLUGS = new Set(SYSTEM_ROLE_TEMPLATES.map((t) => t.slug));
import { AuditService } from "../common/audit.service";
import { AuthUser } from "../auth/auth.types";
import {
  AdjustStockDto,
  CreateBranchDto,
  CreateFiscalResolutionDto,
  PaymentMethodsDto,
  ResetPasswordDto,
  UpdateBranchMetaDto,
  UpdateCategoryDto,
  UpdateCompanyAdminDto,
  UpdateFiscalResolutionAdminDto,
  UpsertAreaDto,
  UpsertCashRegisterDto,
  UpsertKdsRoutingDto,
  UpsertKdsStationDto,
  UpsertModifierGroupDto,
  UpsertModifierOptionDto,
  UpsertStaffDto,
  UpsertTableDto,
  UpsertTenantRoleDto,
  UpsertUserDto,
  UpsertWarehouseDto,
} from "./dto/admin.dto";
import { BranchType, BusinessVertical, FiscalDocType, StaffRole, UserRole } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";
import { DianCertificateService } from "../fiscal/dian-certificate.service";
import { OnboardingService } from "../onboarding/onboarding.service";

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private auth: AuthService,
    private permissions: PermissionsService,
    private audit: AuditService,
    private certService: DianCertificateService,
    private onboarding: OnboardingService,
  ) {}

  private async branchContext(branchId: string, tenantId: string) {
    const branch = await this.prisma.branch.findFirst({
      where: { id: branchId, company: { tenantId } },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    return branch;
  }

  private async tenantBranchSettings(branch: { company: { tenant: { id: string; settings: unknown } } }, branchId: string) {
    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    return { settings, branches, branchSettings: (branches[branchId] ?? {}) as Record<string, unknown> };
  }

  private async saveBranchSettings(
    tenantId: string,
    branchId: string,
    patch: Record<string, unknown>,
    userId?: string,
  ) {
    const branch = await this.branchContext(branchId, tenantId);
    const { settings, branches, branchSettings } = await this.tenantBranchSettings(branch, branchId);
    branches[branchId] = { ...branchSettings, ...patch };
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { settings: { ...settings, branches } as object },
    });
    await this.audit.log({ tenantId, userId, action: "update", entity: "branch_settings", branchId, payload: patch });
    return branches[branchId];
  }

  async getSetupStatus(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const { branchSettings } = await this.tenantBranchSettings(branch, branchId);
    const printers = (branchSettings.printers ?? {}) as Record<string, string>;
    const kiosk = (branchSettings.kiosk ?? {}) as { waiterExitPin?: string };
    const paymentMethods = (branchSettings.paymentMethods as { enabled?: string[] } | undefined)?.enabled;

    const [
      areas,
      tables,
      staff,
      waiters,
      users,
      waiterUsers,
      stations,
      routingRules,
      resolutions,
      categories,
      products,
      registers,
      warehouses,
    ] = await Promise.all([
      this.prisma.diningArea.count({ where: { branchId, isActive: true } }),
      this.prisma.table.count({ where: { branchId, isActive: true } }),
      this.prisma.staff.count({ where: { branchId, isActive: true } }),
      this.prisma.staff.count({ where: { branchId, isActive: true, role: "waiter" } }),
      this.prisma.user.count({ where: { tenantId: user.tenantId, isActive: true } }),
      this.prisma.user.count({ where: { tenantId: user.tenantId, isActive: true, role: "waiter" } }),
      this.prisma.kdsStation.count({ where: { branchId, isActive: true } }),
      this.prisma.kdsRoutingRule.count({ where: { branchId } }),
      this.prisma.fiscalResolution.count({ where: { companyId: branch.companyId, isActive: true } }),
      this.prisma.category.count({ where: { branchId, isActive: true } }),
      this.prisma.product.count({ where: { branchId, isActive: true } }),
      this.prisma.cashRegister.count({ where: { branchId, isActive: true } }),
      this.prisma.warehouse.count({ where: { branchId, isActive: true } }),
    ]);

    const certInfo = this.certService.getInfo();
    const companyComplete = Boolean(branch.company.nit && branch.company.razonSocial && branch.company.address);

    const checklist = [
      { id: "company", label: "Empresa (NIT, razón social, dirección)", ok: companyComplete, blocking: true },
      { id: "areas", label: "Áreas de comedor", ok: areas > 0, blocking: true, count: areas },
      { id: "tables", label: "Mesas activas", ok: tables > 0, blocking: true, count: tables },
      { id: "categories", label: "Categorías de menú", ok: categories > 0, blocking: true, count: categories },
      { id: "products", label: "Productos activos", ok: products > 0, blocking: true, count: products },
      { id: "staff", label: "Personal de piso", ok: staff > 0, blocking: true, count: staff },
      { id: "waiters", label: "Meseros (staff)", ok: waiters > 0, blocking: true, count: waiters },
      { id: "users", label: "Usuarios con login", ok: users >= 2, blocking: true, count: users },
      { id: "waiter_user", label: "Usuario mesero (login)", ok: waiterUsers > 0, blocking: true, count: waiterUsers },
      { id: "kds_stations", label: "Estaciones KDS", ok: stations > 0, blocking: true, count: stations },
      { id: "kds_routing", label: "Reglas enrutamiento KDS", ok: routingRules > 0, blocking: true, count: routingRules },
      { id: "cash_registers", label: "Cajas registradoras", ok: registers > 0, blocking: true, count: registers },
      { id: "warehouses", label: "Bodegas", ok: warehouses > 0, blocking: true, count: warehouses },
      { id: "fiscal_resolution", label: "Resolución fiscal activa", ok: resolutions > 0, blocking: true, count: resolutions },
      { id: "payment_methods", label: "Métodos de pago configurados", ok: (paymentMethods?.length ?? 0) > 0, blocking: true },
      { id: "kiosk_pin", label: "PIN modo mesero", ok: Boolean(kiosk.waiterExitPin?.trim()), blocking: true },
      { id: "printers", label: "IP impresora caja", ok: Boolean(printers.cashPrinterIp?.trim()), blocking: false },
      { id: "kitchen_printer", label: "IP impresora cocina", ok: Boolean(printers.kitchenPrinterIp?.trim()), blocking: false },
      { id: "fiscal_cert", label: "Certificado DIAN (.p12)", ok: certInfo.loaded, blocking: false, note: "Requerido para facturación real" },
    ];

    const blockingPending = checklist.filter((c) => c.blocking && !c.ok);
    const optionalPending = checklist.filter((c) => !c.blocking && !c.ok);

    return {
      branch: { id: branch.id, name: branch.name, type: branch.type, address: branch.address, timezone: branch.timezone, isActive: branch.isActive },
      company: branch.company,
      counts: { areas, tables, staff, waiters, users, waiterUsers, stations, routingRules, resolutions, categories, products, registers, warehouses },
      checklist,
      blockingPending: blockingPending.map((c) => c.id),
      optionalPending: optionalPending.map((c) => c.id),
      readyForProduction: blockingPending.length === 0,
      readyForDian: certInfo.loaded && resolutions > 0,
      fiscalSimulation: process.env.FISCAL_ENV === "simulacion",
    };
  }

  async applySetupDefaults(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const { branchSettings } = await this.tenantBranchSettings(branch, branchId);
    const patch: Record<string, unknown> = {};

    if (!(branchSettings.paymentMethods as { enabled?: string[] } | undefined)?.enabled?.length) {
      patch.paymentMethods = { enabled: ["cash", "card", "transfer", "qr"] };
    }
    if (!(branchSettings.kiosk as { waiterExitPin?: string } | undefined)?.waiterExitPin) {
      patch.kiosk = { ...(branchSettings.kiosk as object ?? {}), waiterExitPin: "2025" };
    }
    const printers = (branchSettings.printers ?? {}) as Record<string, string>;
    if (!printers.cashPrinterIp) {
      patch.printers = {
        ...printers,
        cashPrinterIp: process.env.PRINTER_IP ?? "192.168.1.100",
        cashPrinterPort: printers.cashPrinterPort ?? "9100",
        kitchenPrinterIp: printers.kitchenPrinterIp ?? process.env.KITCHEN_PRINTER_IP ?? "192.168.1.101",
        kitchenPrinterPort: printers.kitchenPrinterPort ?? "9100",
      };
    }

    if (Object.keys(patch).length) {
      await this.saveBranchSettings(user.tenantId, branchId, patch, user.id);
    }

    return this.getSetupStatus(branchId, user);
  }

  async getBranchMeta(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const { branchSettings } = await this.tenantBranchSettings(branch, branchId);
    return { ...branch, settings: branchSettings };
  }

  async updateBranchMeta(branchId: string, user: AuthUser, dto: UpdateBranchMetaDto) {
    await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.branch.update({
      where: { id: branchId },
      data: {
        name: dto.name,
        address: dto.address,
        timezone: dto.timezone,
        type: dto.type as BranchType | undefined,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "branch", entityId: branchId, branchId, payload: dto });
    return updated;
  }

  async createBranch(user: AuthUser, dto: CreateBranchDto) {
    const company = await this.prisma.company.findFirst({ where: { id: dto.companyId, tenantId: user.tenantId } });
    if (!company) throw new NotFoundException("Empresa no encontrada");

    const branch = await this.prisma.branch.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        type: dto.type as BranchType,
        address: dto.address ?? null,
      },
    });
    await this.prisma.warehouse.create({ data: { branchId: branch.id, name: "Bodega principal", isDefault: true } });
    await this.prisma.cashRegister.create({ data: { branchId: branch.id, name: "Caja 1" } });
    if (dto.type === "restaurant") {
      const area = await this.prisma.diningArea.create({ data: { branchId: branch.id, name: "Salón" } });
      await this.prisma.table.create({ data: { branchId: branch.id, diningAreaId: area.id, name: "M1", capacity: 4 } });
      const station = await this.prisma.kdsStation.create({ data: { branchId: branch.id, name: "Cocina" } });
      await this.prisma.kdsRoutingRule.create({ data: { branchId: branch.id, stationId: station.id, course: "main" } });
    }
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "branch", entityId: branch.id, payload: dto });
    return branch;
  }

  async updateCompany(branchId: string, user: AuthUser, dto: UpdateCompanyAdminDto) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.company.update({
      where: { id: branch.companyId },
      data: {
        name: dto.name,
        razonSocial: dto.razonSocial,
        nit: dto.nit,
        dv: dto.dv,
        email: dto.email,
        phone: dto.phone,
        address: dto.address,
        city: dto.city,
        department: dto.department,
        vertical: dto.vertical as BusinessVertical | undefined,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "company", entityId: updated.id, branchId, payload: dto });
    return updated;
  }

  async listFiscalResolutions(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    return this.prisma.fiscalResolution.findMany({
      where: { companyId: branch.companyId },
      orderBy: { createdAt: "desc" },
    });
  }

  async createFiscalResolution(branchId: string, user: AuthUser, dto: CreateFiscalResolutionDto) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.fiscalResolution.create({
      data: {
        companyId: branch.companyId,
        docType: dto.docType as FiscalDocType,
        prefix: dto.prefix,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        currentNumber: dto.fromNumber,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : new Date(),
        validTo: dto.validTo ? new Date(dto.validTo) : new Date(Date.now() + 365 * 86400000),
        technicalKey: dto.technicalKey ?? null,
        isActive: true,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "fiscal_resolution", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateFiscalResolution(branchId: string, user: AuthUser, id: string, dto: UpdateFiscalResolutionAdminDto) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const resolution = await this.prisma.fiscalResolution.findFirst({ where: { id, companyId: branch.companyId } });
    if (!resolution) throw new NotFoundException("Resolución no encontrada");
    const updated = await this.prisma.fiscalResolution.update({
      where: { id },
      data: {
        prefix: dto.prefix,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : undefined,
        validTo: dto.validTo ? new Date(dto.validTo) : undefined,
        technicalKey: dto.technicalKey,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "fiscal_resolution", entityId: id, branchId, payload: dto });
    return updated;
  }

  async uploadCertificate(branchId: string, user: AuthUser, file: { buffer: Buffer; originalname: string }, password?: string) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const dir = path.join(process.cwd(), "certs");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `tenant-${user.tenantId}.p12`);
    fs.writeFileSync(dest, file.buffer);
    process.env.FISCAL_CERT_PATH = dest;
    if (password !== undefined) process.env.FISCAL_CERT_PASSWORD = password;
    const info = this.certService.loadCertificate();
    const { settings, branches, branchSettings } = await this.tenantBranchSettings(branch, branchId);
    branches[branchId] = {
      ...branchSettings,
      fiscal: { certPath: dest, certUploadedAt: new Date().toISOString(), passwordSet: Boolean(password) },
    };
    await this.prisma.tenant.update({
      where: { id: user.tenantId },
      data: { settings: { ...settings, branches } as object },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "fiscal_certificate", branchId, payload: { path: dest, loaded: info.loaded } });
    return { ...info, path: dest };
  }

  async getPaymentMethods(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const { branchSettings } = await this.tenantBranchSettings(branch, branchId);
    const pm = (branchSettings.paymentMethods as { enabled?: string[] } | undefined)?.enabled;
    return { enabled: pm ?? ["cash", "card", "transfer", "qr"] };
  }

  async updatePaymentMethods(branchId: string, user: AuthUser, dto: PaymentMethodsDto) {
    return this.saveBranchSettings(user.tenantId, branchId, { paymentMethods: { enabled: dto.enabled } }, user.id);
  }

  async listCategories(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.category.findMany({
      where: { branchId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: { children: { orderBy: { sortOrder: "asc" } } },
    });
  }

  async updateCategory(branchId: string, user: AuthUser, id: string, dto: UpdateCategoryDto) {
    await this.branchContext(branchId, user.tenantId);
    const cat = await this.prisma.category.findFirst({ where: { id, branchId } });
    if (!cat) throw new NotFoundException("Categoría no encontrada");
    const updated = await this.prisma.category.update({ where: { id }, data: dto });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "category", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteCategory(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const cat = await this.prisma.category.findFirst({ where: { id, branchId } });
    if (!cat) throw new NotFoundException("Categoría no encontrada");
    const products = await this.prisma.product.count({ where: { categoryId: id, isActive: true } });
    if (products > 0) throw new BadRequestException("La categoría tiene productos activos");
    const updated = await this.prisma.category.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "category", entityId: id, branchId });
    return updated;
  }

  async listAreas(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.diningArea.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  }

  async createArea(branchId: string, user: AuthUser, dto: UpsertAreaDto) {
    await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.diningArea.create({ data: { branchId, name: dto.name, isActive: dto.isActive ?? true } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "dining_area", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateArea(branchId: string, user: AuthUser, id: string, dto: UpsertAreaDto) {
    await this.branchContext(branchId, user.tenantId);
    const area = await this.prisma.diningArea.findFirst({ where: { id, branchId } });
    if (!area) throw new NotFoundException("Área no encontrada");
    const updated = await this.prisma.diningArea.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive ?? area.isActive } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "dining_area", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteArea(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const tables = await this.prisma.table.count({ where: { diningAreaId: id, isActive: true } });
    if (tables > 0) throw new BadRequestException("El área tiene mesas activas");
    const updated = await this.prisma.diningArea.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "dining_area", entityId: id, branchId });
    return updated;
  }

  async listTablesAdmin(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.table.findMany({
      where: { branchId },
      orderBy: [{ diningAreaId: "asc" }, { name: "asc" }],
      include: { area: true },
    });
  }

  async createTable(branchId: string, user: AuthUser, dto: UpsertTableDto) {
    await this.branchContext(branchId, user.tenantId);
    const area = await this.prisma.diningArea.findFirst({ where: { id: dto.diningAreaId, branchId, isActive: true } });
    if (!area) throw new BadRequestException("Área no válida");
    const created = await this.prisma.table.create({
      data: { branchId, diningAreaId: dto.diningAreaId, name: dto.name, capacity: dto.capacity ?? null, isActive: dto.isActive ?? true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "table", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateTable(branchId: string, user: AuthUser, id: string, dto: UpsertTableDto) {
    await this.branchContext(branchId, user.tenantId);
    const table = await this.prisma.table.findFirst({ where: { id, branchId } });
    if (!table) throw new NotFoundException("Mesa no encontrada");
    const updated = await this.prisma.table.update({
      where: { id },
      data: {
        diningAreaId: dto.diningAreaId,
        name: dto.name,
        capacity: dto.capacity,
        isActive: dto.isActive ?? table.isActive,
      },
      include: { area: true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "table", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteTable(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const open = await this.prisma.tableSession.count({ where: { tableId: id, status: "open" } });
    if (open > 0) throw new BadRequestException("La mesa tiene sesión abierta");
    const updated = await this.prisma.table.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "table", entityId: id, branchId });
    return updated;
  }

  async listStaff(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.staff.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  }

  async createStaff(branchId: string, user: AuthUser, dto: UpsertStaffDto) {
    const branch = await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.staff.create({
      data: {
        companyId: branch.companyId,
        branchId,
        name: dto.name,
        role: dto.role as StaffRole,
        phone: dto.phone ?? null,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "staff", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateStaff(branchId: string, user: AuthUser, id: string, dto: UpsertStaffDto) {
    await this.branchContext(branchId, user.tenantId);
    const staff = await this.prisma.staff.findFirst({ where: { id, branchId } });
    if (!staff) throw new NotFoundException("Personal no encontrado");
    const updated = await this.prisma.staff.update({
      where: { id },
      data: {
        name: dto.name,
        role: dto.role as StaffRole,
        phone: dto.phone ?? null,
        isActive: dto.isActive ?? staff.isActive,
      },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "staff", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteStaff(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.staff.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "staff", entityId: id, branchId });
    return updated;
  }

  async listUsers(user: AuthUser) {
    await this.permissions.ensureDefaultRoles(user.tenantId);
    return this.prisma.user.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        tenantRole: { select: { id: true, name: true, slug: true, isSystem: true } },
      },
    });
  }

  private async resolveUserRoleAssignment(tenantId: string, dto: { roleId?: string; role?: string }) {
    await this.permissions.ensureDefaultRoles(tenantId);
    if (dto.roleId) {
      const tenantRole = await this.prisma.tenantRole.findFirst({
        where: { id: dto.roleId, tenantId, isActive: true },
      });
      if (!tenantRole) throw new BadRequestException("Rol no válido");
      return {
        roleId: tenantRole.id,
        role: (tenantRole.legacyRole ?? dto.role ?? "waiter") as UserRole,
      };
    }
    if (dto.role) {
      const tenantRole = await this.prisma.tenantRole.findFirst({
        where: { tenantId, slug: dto.role, isSystem: true },
      });
      return { roleId: tenantRole?.id ?? null, role: dto.role as UserRole };
    }
    throw new BadRequestException("Debe indicar roleId o role");
  }

  async createUser(user: AuthUser, dto: UpsertUserDto) {
    if (!dto.password) throw new BadRequestException("Contraseña requerida");
    const existing = await this.prisma.user.findFirst({ where: { tenantId: user.tenantId, email: dto.email } });
    if (existing) throw new BadRequestException("El email ya existe");
    const assignment = await this.resolveUserRoleAssignment(user.tenantId, dto);
    if (assignment.role === "owner" && user.role !== "owner" && !hasPermission(user.permissions, "*")) {
      throw new BadRequestException("Solo el propietario puede crear usuarios owner");
    }
    const created = await this.prisma.user.create({
      data: {
        tenantId: user.tenantId,
        email: dto.email,
        name: dto.name,
        role: assignment.role,
        roleId: assignment.roleId,
        passwordHash: this.auth.formatPasswordHash(dto.password),
        isActive: dto.isActive ?? true,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        isActive: true,
        tenantRole: { select: { id: true, name: true, slug: true } },
      },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create",
      entity: "user",
      entityId: created.id,
      payload: { email: dto.email, role: assignment.role, roleId: assignment.roleId },
    });
    return created;
  }

  async updateUser(user: AuthUser, id: string, dto: UpsertUserDto) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    if (target.role === "owner" && user.role !== "owner" && !hasPermission(user.permissions, "*")) {
      throw new BadRequestException("Solo el owner puede editar owners");
    }
    const assignment = await this.resolveUserRoleAssignment(user.tenantId, dto);
    if (assignment.role === "owner" && user.role !== "owner" && !hasPermission(user.permissions, "*")) {
      throw new BadRequestException("Solo el propietario puede asignar rol owner");
    }
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        email: dto.email,
        name: dto.name,
        role: assignment.role,
        roleId: assignment.roleId,
        isActive: dto.isActive ?? target.isActive,
        ...(dto.password ? { passwordHash: this.auth.formatPasswordHash(dto.password) } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        isActive: true,
        tenantRole: { select: { id: true, name: true, slug: true } },
      },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "update",
      entity: "user",
      entityId: id,
      payload: { email: dto.email, role: assignment.role, roleId: assignment.roleId },
    });
    return updated;
  }

  async resetUserPassword(user: AuthUser, id: string, dto: ResetPasswordDto) {
    const target = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    await this.prisma.user.update({ where: { id }, data: { passwordHash: this.auth.formatPasswordHash(dto.password) } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "user_password", entityId: id });
    return { ok: true };
  }

  async deleteUser(user: AuthUser, id: string) {
    if (id === user.id) throw new BadRequestException("No puedes desactivarte a ti mismo");
    const target = await this.prisma.user.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!target) throw new NotFoundException("Usuario no encontrado");
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "user", entityId: id });
    return updated;
  }

  listPermissions() {
    return this.permissions.getCatalog();
  }

  async listRoles(user: AuthUser) {
    await this.permissions.ensureDefaultRoles(user.tenantId);
    const roles = await this.prisma.tenantRole.findMany({
      where: { tenantId: user.tenantId, isActive: true },
      orderBy: [{ isSystem: "desc" }, { name: "asc" }],
      include: { _count: { select: { users: true } } },
    });
    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      description: r.description,
      permissions: r.permissions,
      legacyRole: r.legacyRole,
      isSystem: r.isSystem,
      userCount: r._count.users,
    }));
  }

  async createRole(user: AuthUser, dto: UpsertTenantRoleDto) {
    if (!hasPermission(user.permissions, "*") && !hasPermission(user.permissions, "admin.roles")) {
      throw new BadRequestException("No tienes permiso para crear roles");
    }
    const slug = dto.name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    if (!slug) throw new BadRequestException("Nombre de rol inválido");
    if (SYSTEM_ROLE_SLUGS.has(slug)) throw new BadRequestException("Ese slug está reservado para roles del sistema");

    const permissions = this.permissions.sanitizePermissions(dto.permissions);
    if (!permissions.length) throw new BadRequestException("Selecciona al menos un permiso");

    const created = await this.prisma.tenantRole.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        slug,
        description: dto.description?.trim() || null,
        permissions,
        legacyRole: dto.legacyRole as UserRole | undefined,
        isSystem: false,
        isActive: true,
      },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "create",
      entity: "tenant_role",
      entityId: created.id,
      payload: { name: created.name, permissions },
    });
    return created;
  }

  async updateRole(user: AuthUser, id: string, dto: UpsertTenantRoleDto) {
    if (!hasPermission(user.permissions, "*") && !hasPermission(user.permissions, "admin.roles")) {
      throw new BadRequestException("No tienes permiso para editar roles");
    }
    const role = await this.prisma.tenantRole.findFirst({ where: { id, tenantId: user.tenantId } });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role.isSystem) throw new BadRequestException("Los roles del sistema no se editan — duplícalo como rol custom");

    const permissions = this.permissions.sanitizePermissions(dto.permissions);
    if (!permissions.length) throw new BadRequestException("Selecciona al menos un permiso");

    const updated = await this.prisma.tenantRole.update({
      where: { id },
      data: {
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        permissions,
        legacyRole: dto.legacyRole as UserRole | undefined,
        isActive: dto.isActive ?? role.isActive,
      },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "update",
      entity: "tenant_role",
      entityId: id,
      payload: { name: updated.name, permissions },
    });
    return updated;
  }

  async deleteRole(user: AuthUser, id: string) {
    if (!hasPermission(user.permissions, "*") && !hasPermission(user.permissions, "admin.roles")) {
      throw new BadRequestException("No tienes permiso para eliminar roles");
    }
    const role = await this.prisma.tenantRole.findFirst({
      where: { id, tenantId: user.tenantId },
      include: { _count: { select: { users: true } } },
    });
    if (!role) throw new NotFoundException("Rol no encontrado");
    if (role.isSystem) throw new BadRequestException("No se pueden eliminar roles del sistema");
    if (role._count.users > 0) throw new BadRequestException("El rol tiene usuarios asignados");

    const updated = await this.prisma.tenantRole.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({
      tenantId: user.tenantId,
      userId: user.id,
      action: "delete",
      entity: "tenant_role",
      entityId: id,
    });
    return updated;
  }

  async listKdsStations(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.kdsStation.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  }

  async createKdsStation(branchId: string, user: AuthUser, dto: UpsertKdsStationDto) {
    await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.kdsStation.create({ data: { branchId, name: dto.name, isActive: dto.isActive ?? true } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "kds_station", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateKdsStation(branchId: string, user: AuthUser, id: string, dto: UpsertKdsStationDto) {
    await this.branchContext(branchId, user.tenantId);
    const station = await this.prisma.kdsStation.findFirst({ where: { id, branchId } });
    if (!station) throw new NotFoundException("Estación no encontrada");
    const updated = await this.prisma.kdsStation.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive ?? station.isActive } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "kds_station", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteKdsStation(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.kdsStation.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "kds_station", entityId: id, branchId });
    return updated;
  }

  async listKdsRouting(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.kdsRoutingRule.findMany({ where: { branchId }, include: { station: true } });
  }

  async createKdsRouting(branchId: string, user: AuthUser, dto: UpsertKdsRoutingDto) {
    await this.branchContext(branchId, user.tenantId);
    const station = await this.prisma.kdsStation.findFirst({ where: { id: dto.stationId, branchId } });
    if (!station) throw new BadRequestException("Estación no válida");
    const created = await this.prisma.kdsRoutingRule.create({
      data: { branchId, stationId: dto.stationId, variantId: dto.variantId ?? null, course: dto.course ?? null },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "kds_routing", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async deleteKdsRouting(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    await this.prisma.kdsRoutingRule.delete({ where: { id } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "kds_routing", entityId: id, branchId });
    return { ok: true };
  }

  async listCashRegisters(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.cashRegister.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  }

  async createCashRegister(branchId: string, user: AuthUser, dto: UpsertCashRegisterDto) {
    await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.cashRegister.create({ data: { branchId, name: dto.name, isActive: dto.isActive ?? true } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "cash_register", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateCashRegister(branchId: string, user: AuthUser, id: string, dto: UpsertCashRegisterDto) {
    await this.branchContext(branchId, user.tenantId);
    const reg = await this.prisma.cashRegister.findFirst({ where: { id, branchId } });
    if (!reg) throw new NotFoundException("Caja no encontrada");
    const updated = await this.prisma.cashRegister.update({ where: { id }, data: { name: dto.name, isActive: dto.isActive ?? reg.isActive } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "cash_register", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteCashRegister(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.cashRegister.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "cash_register", entityId: id, branchId });
    return updated;
  }

  async listWarehouses(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.warehouse.findMany({ where: { branchId }, orderBy: { name: "asc" } });
  }

  async createWarehouse(branchId: string, user: AuthUser, dto: UpsertWarehouseDto) {
    await this.branchContext(branchId, user.tenantId);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ where: { branchId }, data: { isDefault: false } });
    }
    const created = await this.prisma.warehouse.create({
      data: { branchId, name: dto.name, isDefault: dto.isDefault ?? false, isActive: dto.isActive ?? true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "warehouse", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateWarehouse(branchId: string, user: AuthUser, id: string, dto: UpsertWarehouseDto) {
    await this.branchContext(branchId, user.tenantId);
    if (dto.isDefault) {
      await this.prisma.warehouse.updateMany({ where: { branchId }, data: { isDefault: false } });
    }
    const wh = await this.prisma.warehouse.findFirst({ where: { id, branchId } });
    if (!wh) throw new NotFoundException("Bodega no encontrada");
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data: { name: dto.name, isDefault: dto.isDefault ?? wh.isDefault, isActive: dto.isActive ?? wh.isActive },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "warehouse", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteWarehouse(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const wh = await this.prisma.warehouse.findFirst({ where: { id, branchId } });
    if (wh?.isDefault) throw new BadRequestException("No se puede desactivar la bodega principal");
    const updated = await this.prisma.warehouse.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "warehouse", entityId: id, branchId });
    return updated;
  }

  async listStock(branchId: string, user: AuthUser, warehouseId?: string) {
    await this.branchContext(branchId, user.tenantId);
    const whId = warehouseId ?? (await this.prisma.warehouse.findFirst({ where: { branchId, isDefault: true } }))?.id;
    if (!whId) return [];
    return this.prisma.stockLevel.findMany({
      where: { warehouseId: whId },
      include: { variant: { include: { product: true } } },
      orderBy: { variant: { product: { name: "asc" } } },
    });
  }

  async adjustStock(branchId: string, user: AuthUser, dto: AdjustStockDto) {
    await this.branchContext(branchId, user.tenantId);
    const wh = await this.prisma.warehouse.findFirst({ where: { id: dto.warehouseId, branchId } });
    if (!wh) throw new BadRequestException("Bodega no válida");
    const level = await this.prisma.stockLevel.upsert({
      where: { warehouseId_variantId: { warehouseId: dto.warehouseId, variantId: dto.variantId } },
      create: { warehouseId: dto.warehouseId, variantId: dto.variantId, quantity: dto.quantity },
      update: { quantity: dto.quantity },
      include: { variant: { include: { product: true } } },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "stock_level", entityId: level.id, branchId, payload: dto });
    return level;
  }

  async listModifierGroups(branchId: string, user: AuthUser) {
    await this.branchContext(branchId, user.tenantId);
    return this.prisma.modifierGroup.findMany({
      where: { branchId },
      orderBy: { name: "asc" },
      include: { options: true, products: { include: { product: true } } },
    });
  }

  async createModifierGroup(branchId: string, user: AuthUser, dto: UpsertModifierGroupDto) {
    await this.branchContext(branchId, user.tenantId);
    const created = await this.prisma.modifierGroup.create({
      data: {
        branchId,
        name: dto.name,
        minSelect: dto.minSelect ?? 0,
        maxSelect: dto.maxSelect ?? 1,
        isActive: dto.isActive ?? true,
      },
    });
    if (dto.productIds?.length) {
      await this.prisma.productModifierGroup.createMany({
        data: dto.productIds.map((productId, i) => ({ productId, modifierGroupId: created.id, sortOrder: i })),
        skipDuplicates: true,
      });
    }
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "modifier_group", entityId: created.id, branchId, payload: dto });
    return this.prisma.modifierGroup.findUnique({ where: { id: created.id }, include: { options: true, products: true } });
  }

  async updateModifierGroup(branchId: string, user: AuthUser, id: string, dto: UpsertModifierGroupDto) {
    await this.branchContext(branchId, user.tenantId);
    const group = await this.prisma.modifierGroup.findFirst({ where: { id, branchId } });
    if (!group) throw new NotFoundException("Grupo no encontrado");
    await this.prisma.modifierGroup.update({
      where: { id },
      data: {
        name: dto.name,
        minSelect: dto.minSelect,
        maxSelect: dto.maxSelect,
        isActive: dto.isActive ?? group.isActive,
      },
    });
    if (dto.productIds) {
      await this.prisma.productModifierGroup.deleteMany({ where: { modifierGroupId: id } });
      if (dto.productIds.length) {
        await this.prisma.productModifierGroup.createMany({
          data: dto.productIds.map((productId, i) => ({ productId, modifierGroupId: id, sortOrder: i })),
        });
      }
    }
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "modifier_group", entityId: id, branchId, payload: dto });
    return this.prisma.modifierGroup.findUnique({ where: { id }, include: { options: true, products: true } });
  }

  async deleteModifierGroup(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const updated = await this.prisma.modifierGroup.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "modifier_group", entityId: id, branchId });
    return updated;
  }

  async createModifierOption(branchId: string, user: AuthUser, groupId: string, dto: UpsertModifierOptionDto) {
    await this.branchContext(branchId, user.tenantId);
    const group = await this.prisma.modifierGroup.findFirst({ where: { id: groupId, branchId } });
    if (!group) throw new NotFoundException("Grupo no encontrado");
    const created = await this.prisma.modifierOption.create({
      data: { modifierGroupId: groupId, name: dto.name, priceDelta: dto.priceDelta ?? 0, isActive: dto.isActive ?? true },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "create", entity: "modifier_option", entityId: created.id, branchId, payload: dto });
    return created;
  }

  async updateModifierOption(branchId: string, user: AuthUser, id: string, dto: UpsertModifierOptionDto) {
    await this.branchContext(branchId, user.tenantId);
    const opt = await this.prisma.modifierOption.findFirst({ where: { id }, include: { modifierGroup: true } });
    if (!opt || opt.modifierGroup.branchId !== branchId) throw new NotFoundException("Opción no encontrada");
    const updated = await this.prisma.modifierOption.update({
      where: { id },
      data: { name: dto.name, priceDelta: dto.priceDelta ?? opt.priceDelta, isActive: dto.isActive ?? opt.isActive },
    });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "modifier_option", entityId: id, branchId, payload: dto });
    return updated;
  }

  async deleteModifierOption(branchId: string, user: AuthUser, id: string) {
    await this.branchContext(branchId, user.tenantId);
    const opt = await this.prisma.modifierOption.findFirst({ where: { id }, include: { modifierGroup: true } });
    if (!opt || opt.modifierGroup.branchId !== branchId) throw new NotFoundException("Opción no encontrada");
    const updated = await this.prisma.modifierOption.update({ where: { id }, data: { isActive: false } });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "delete", entity: "modifier_option", entityId: id, branchId });
    return updated;
  }

  async getAuditLog(user: AuthUser, limit?: number) {
    return this.audit.list(user.tenantId, limit);
  }

  async getOnboardingState(branchId: string, user: AuthUser) {
    const branch = await this.branchContext(branchId, user.tenantId);
    return {
      companyId: branch.companyId,
      branchId: branch.id,
      vertical: branch.company.vertical,
      branchType: branch.type,
      steps: ["business", "branch", "fiscal", "catalog", "golive"],
      note: "Usa reapply-* para volver a ejecutar pasos del wizard sin crear tenant nuevo.",
    };
  }

  async reapplyCatalog(branchId: string, user: AuthUser, template: "restaurant" | "bakery" | "cafe" = "restaurant") {
    await this.branchContext(branchId, user.tenantId);
    const result = await this.onboarding.stepCatalog({ branchId, template });
    await this.audit.log({ tenantId: user.tenantId, userId: user.id, action: "update", entity: "onboarding_catalog", branchId, payload: { template } });
    return result;
  }
}
