import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "../auth/auth.service";
import {
  OnboardingBranchDto,
  OnboardingBusinessDto,
  OnboardingCatalogDto,
  OnboardingFiscalDto,
  OnboardingGoLiveDto,
} from "./dto/onboarding.dto";
import { BranchType, BusinessVertical, FiscalDocType, ProductType, StaffRole, TaxType } from "@prisma/client";
import {
  buildOperationalChecklist,
  MANUAL_OPERATIONAL_ITEMS,
  OperationalChecklist,
} from "./operational-checklist";
import {
  REQUIRED_WAITER_TRAINING_IDS,
  WAITER_TRAINING_STEPS,
} from "./waiter-training.content";
import { readBranchNotificationSettings } from "../settings/branch-notifications.util";

const CATALOG_TEMPLATES: Record<string, { cat: string; items: [string, number, boolean?][] }[]> = {
  bakery: [
    { cat: "Pan", items: [["Pan aliñado", 1200], ["Baguette", 3500], ["Pan integral (kg)", 12000, true]] },
    { cat: "Pastelería", items: [["Croissant", 4500], ["Torta porción", 6500], ["Galleta", 2000]] },
    { cat: "Bebidas", items: [["Café americano", 4000], ["Chocolate", 4500], ["Jugo natural", 5000]] },
  ],
  restaurant: [
    { cat: "Entradas", items: [["Papas francesas", 8000], ["Sopa del día", 9000]] },
    { cat: "Platos fuertes", items: [["Bandeja paisa", 28000], ["Pollo asado", 22000], ["Hamburguesa", 18000]] },
    { cat: "Bebidas", items: [["Gaseosa", 5000], ["Limonada", 6000], ["Cerveza", 7000]] },
  ],
  cafe: [
    { cat: "Café", items: [["Espresso", 3500], ["Capuccino", 5500], ["Latte", 6000]] },
    { cat: "Acompañantes", items: [["Almojábana", 2500], ["Brownie", 5000]] },
    { cat: "Bebidas frías", items: [["Frappé", 8000], ["Té helado", 5500]] },
  ],
};

@Injectable()
export class OnboardingService {
  constructor(private prisma: PrismaService, private auth: AuthService) {}

  async stepBusiness(dto: OnboardingBusinessDto) {
    const result = await this.auth.registerTenant({
      tenantName: dto.tenantName,
      slug: dto.slug,
      ownerName: dto.ownerName,
      email: dto.email,
      password: dto.password,
      companyName: dto.companyName,
      vertical: dto.vertical,
    });

    const company = await this.prisma.company.update({
      where: { id: result.company.id },
      data: {
        nit: dto.nit,
        dv: dto.dv ?? null,
        razonSocial: dto.companyName,
        phone: dto.phone ?? null,
        address: dto.address ?? null,
        city: dto.city ?? null,
        vertical: dto.vertical as BusinessVertical,
      },
    });

    return {
      step: "business",
      complete: true,
      tenantId: result.tenant.id,
      companyId: company.id,
      userId: result.user.id,
      next: "branch",
    };
  }

  async stepBranch(dto: OnboardingBranchDto) {
    const branch = await this.prisma.branch.create({
      data: {
        companyId: dto.companyId,
        name: dto.branchName,
        type: dto.branchType as BranchType,
        address: dto.address ?? null,
      },
    });

    await this.prisma.warehouse.create({
      data: { branchId: branch.id, name: "Bodega principal", isDefault: true },
    });

    await this.prisma.cashRegister.create({
      data: { branchId: branch.id, name: "Caja 1" },
    });

    if (dto.branchType === "restaurant") {
      const area = await this.prisma.diningArea.create({
        data: { branchId: branch.id, name: "Salón" },
      });
      await this.prisma.table.createMany({
        data: [
          { branchId: branch.id, diningAreaId: area.id, name: "M1", capacity: 4 },
          { branchId: branch.id, diningAreaId: area.id, name: "M2", capacity: 2 },
          { branchId: branch.id, diningAreaId: area.id, name: "M3", capacity: 4 },
        ],
      });
      const station = await this.prisma.kdsStation.create({
        data: { branchId: branch.id, name: "Cocina" },
      });
      await this.prisma.kdsRoutingRule.create({
        data: { branchId: branch.id, stationId: station.id, course: "main" },
      });
    }

    return { step: "branch", complete: true, branchId: branch.id, next: "fiscal" };
  }

  async stepFiscal(dto: OnboardingFiscalDto) {
    const resolution = await this.prisma.fiscalResolution.create({
      data: {
        companyId: dto.companyId,
        docType: FiscalDocType.pos_equivalent,
        prefix: dto.prefix,
        fromNumber: dto.fromNumber,
        toNumber: dto.toNumber,
        currentNumber: dto.fromNumber - 1,
        validFrom: new Date(dto.validFrom),
        validTo: new Date(dto.validTo),
        technicalKey: dto.technicalKey ?? null,
      },
    });

    return { step: "fiscal", complete: true, resolutionId: resolution.id, next: "catalog" };
  }

  async stepCatalog(dto: OnboardingCatalogDto) {
    const template = CATALOG_TEMPLATES[dto.template];
    if (!template) throw new BadRequestException("Plantilla no válida");

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { branchId: dto.branchId, isDefault: true },
    });
    if (!warehouse) throw new BadRequestException("Bodega no encontrada");

    let productCount = 0;
    for (let i = 0; i < template.length; i++) {
      const group = template[i];
      const category = await this.prisma.category.create({
        data: { branchId: dto.branchId, name: group.cat, sortOrder: i + 1 },
      });

      for (const item of group.items) {
        const [name, price, byWeight] = item;
        const product = await this.prisma.product.create({
          data: {
            branchId: dto.branchId,
            categoryId: category.id,
            name,
            type: byWeight ? ProductType.weight_based : ProductType.standard,
            taxType: TaxType.iva_19,
            course: dto.template === "restaurant" ? "main" : "bakery",
            variants: {
              create: {
                name,
                price,
                sellByWeight: !!byWeight,
                unit: byWeight ? "kg" : "und",
                barcode: `77${Date.now().toString().slice(-8)}${productCount}`,
              },
            },
          },
          include: { variants: true },
        });
        await this.prisma.stockLevel.create({
          data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 100 },
        });
        productCount++;
      }
    }

    return { step: "catalog", complete: true, productsCreated: productCount, next: "golive" };
  }

  async stepGoLive(dto: OnboardingGoLiveDto) {
    const cashRegister = await this.prisma.cashRegister.findFirst({
      where: { branchId: dto.branchId, isActive: true },
    });

    const session = await this.prisma.posSession.create({
      data: {
        branchId: dto.branchId,
        cashRegisterId: cashRegister?.id ?? null,
        userId: dto.userId,
        status: "open",
        openingCash: dto.openingCash,
      },
    });

    return {
      step: "golive",
      complete: true,
      sessionId: session.id,
      branchId: dto.branchId,
      checklist: [
        { item: "Venta de prueba", done: false },
        { item: "Impresión tiquete", done: false },
        { item: "Emisión DE POS", done: false },
        { item: "Set habilitación DIAN", done: false },
      ],
      message: "¡Negocio listo para operar!",
    };
  }

  async getPilotStatus(companyId: string) {
    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      include: {
        branches: {
          include: {
            categories: true,
            posSessions: { where: { status: "open" } },
            invoices: { where: { status: "paid" }, take: 5, orderBy: { createdAt: "desc" } },
          },
        },
        fiscalResolutions: { where: { isActive: true } },
      },
    });
    if (!company) throw new BadRequestException("Empresa no encontrada");

    const branch = company.branches[0];
    const paidCount = await this.prisma.salesInvoice.count({
      where: { companyId, status: "paid" },
    });
    const fiscalCount = await this.prisma.electronicDocument.count({
      where: { companyId, status: "accepted" },
    });

    return {
      company: company.name,
      vertical: company.vertical,
      nit: company.nit,
      branch: branch?.name,
      hasResolution: company.fiscalResolutions.length > 0,
      hasCatalog: (branch?.categories.length ?? 0) > 0,
      cashOpen: (branch?.posSessions.length ?? 0) > 0,
      salesCount: paidCount,
      fiscalDocsAccepted: fiscalCount,
      readyForPilot:
        paidCount >= 1
        && (branch?.categories.length ?? 0) > 0
        && (branch?.posSessions.length ?? 0) > 0,
    };
  }

  private async readOperationalManual(branchId: string): Promise<Record<string, boolean>> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) return {};

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
    const manual = (branchSettings.operationalChecklist ?? {}) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(manual).filter(([, value]) => typeof value === "boolean"),
    ) as Record<string, boolean>;
  }

  private async saveOperationalManual(branchId: string, manual: Record<string, boolean>) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new BadRequestException("Sucursal no encontrada");

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = { ...((settings.branches ?? {}) as Record<string, unknown>) };
    const current = (branches[branchId] ?? {}) as Record<string, unknown>;

    branches[branchId] = {
      ...current,
      operationalChecklist: {
        ...((current.operationalChecklist ?? {}) as Record<string, boolean>),
        ...manual,
      },
    };

    await this.prisma.tenant.update({
      where: { id: branch.company.tenantId },
      data: { settings: { ...settings, branches } as object },
    });
  }

  async getOperationalChecklist(branchId: string): Promise<OperationalChecklist> {
    const [
      activeProducts,
      cashOpen,
      counterSales,
      tableKitchenSent,
      tablePaid,
      kdsServed,
      reservations,
      waiters,
      cashClosedSessions,
      notificationSettings,
      manual,
    ] = await Promise.all([
      this.prisma.product.count({ where: { branchId, isActive: true } }),
      this.prisma.posSession.count({ where: { branchId, status: "open" } }),
      this.prisma.salesInvoice.count({
        where: { branchId, status: "paid", tableSessionId: null },
      }),
      this.prisma.salesInvoice.count({
        where: {
          branchId,
          tableSessionId: { not: null },
          status: { in: ["sent_to_kitchen", "paid"] },
        },
      }),
      this.prisma.salesInvoice.count({
        where: { branchId, status: "paid", tableSessionId: { not: null } },
      }),
      this.prisma.kdsItem.count({
        where: { ticket: { branchId }, servedAt: { not: null } },
      }),
      this.prisma.reservation.count({ where: { branchId } }),
      this.prisma.staff.findMany({
        where: { branchId, role: StaffRole.waiter, isActive: true },
        select: { phone: true },
      }),
      this.prisma.posSession.count({ where: { branchId, status: "closed" } }),
      readBranchNotificationSettings(this.prisma, branchId),
      this.readOperationalManual(branchId),
    ]);

    const waitersWithPhone = waiters.filter((w) => w.phone?.trim()).length;

    return buildOperationalChecklist({
      activeProducts,
      cashOpen: cashOpen > 0,
      counterSales,
      tableKitchenSent,
      tablePaid,
      kdsServed,
      reservations,
      waitersTotal: waiters.length,
      waitersWithPhone,
      hostPhoneConfigured: Boolean(notificationSettings?.hostPhone?.trim()),
      cashClosedSessions,
      manual,
    });
  }

  async updateOperationalChecklistItem(branchId: string, itemId: string, done: boolean) {
    if (!MANUAL_OPERATIONAL_ITEMS.has(itemId)) {
      throw new BadRequestException("Este ítem se verifica automáticamente");
    }

    await this.saveOperationalManual(branchId, { [itemId]: done });
    return this.getOperationalChecklist(branchId);
  }

  private async readWaiterTrainingProgress(branchId: string): Promise<Record<string, boolean>> {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) return {};

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
    const progress = (branchSettings.waiterTraining ?? {}) as Record<string, unknown>;

    return Object.fromEntries(
      Object.entries(progress).filter(([, value]) => typeof value === "boolean"),
    ) as Record<string, boolean>;
  }

  private async saveWaiterTrainingProgress(branchId: string, progress: Record<string, boolean>) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new BadRequestException("Sucursal no encontrada");

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = { ...((settings.branches ?? {}) as Record<string, unknown>) };
    const current = (branches[branchId] ?? {}) as Record<string, unknown>;

    branches[branchId] = {
      ...current,
      waiterTraining: {
        ...((current.waiterTraining ?? {}) as Record<string, boolean>),
        ...progress,
      },
    };

    await this.prisma.tenant.update({
      where: { id: branch.company.tenantId },
      data: { settings: { ...settings, branches } as object },
    });
  }

  async getWaiterTraining(branchId: string) {
    const progress = await this.readWaiterTrainingProgress(branchId);
    const steps = WAITER_TRAINING_STEPS.map((step) => ({
      ...step,
      done: progress[step.id] === true,
    }));
    const requiredDone = REQUIRED_WAITER_TRAINING_IDS.filter((id) => progress[id] === true).length;
    const requiredTotal = REQUIRED_WAITER_TRAINING_IDS.length;
    const staffTrainingMarked = (await this.readOperationalManual(branchId)).staff_training === true;

    return {
      steps,
      progressPct: requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 100,
      requiredDone,
      requiredTotal,
      estimatedMinutes: WAITER_TRAINING_STEPS.reduce((sum, s) => sum + s.durationMin, 0),
      completed: staffTrainingMarked,
      readyToComplete: requiredDone >= requiredTotal,
    };
  }

  async updateWaiterTrainingStep(branchId: string, stepId: string, done: boolean) {
    const valid = WAITER_TRAINING_STEPS.some((s) => s.id === stepId);
    if (!valid) throw new BadRequestException("Paso de capacitación no válido");

    await this.saveWaiterTrainingProgress(branchId, { [stepId]: done });
    return this.getWaiterTraining(branchId);
  }

  async completeWaiterTraining(branchId: string) {
    const progress = Object.fromEntries(
      WAITER_TRAINING_STEPS.map((s) => [s.id, true]),
    ) as Record<string, boolean>;

    await this.saveWaiterTrainingProgress(branchId, progress);
    await this.saveOperationalManual(branchId, { staff_training: true });
    return {
      training: await this.getWaiterTraining(branchId),
      checklist: await this.getOperationalChecklist(branchId),
    };
  }
}
