import {
  PrismaClient,
  BranchType,
  StaffRole,
  PosSessionStatus,
  BusinessVertical,
  ProductType,
  FiscalDocType,
  TaxKind,
} from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { PILOT_YALL, resolvePilotItemConsumptionTax, resolvePilotItemTax } from "../src/config/pilot-yall.config";
import { seedPilotIngredientsAndRecipes } from "../src/config/pilot-recipes.util";
import { COLOMBIA_DEFAULT_TAXES } from "../src/tax/tax-definition.service";

const prisma = new PrismaClient();

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(`${salt}:${password}`).digest("hex");
  return `${salt}:${hash}`;
}

async function seedRestaurantBranch(companyId: string, tenantUserId: string) {
  const existing = await prisma.branch.findFirst({
    where: { companyId, name: PILOT_YALL.branch.name },
  });
  if (existing) {
    console.log("   Sucursal ya existe, omitiendo catálogo duplicado");
    return existing;
  }

  const branch = await prisma.branch.create({
    data: {
      companyId,
      name: PILOT_YALL.branch.name,
      type: BranchType.restaurant,
      address: PILOT_YALL.company.address || null,
    },
  });

  const areaSalon = await prisma.diningArea.create({ data: { branchId: branch.id, name: "Salón" } });
  const areaTerraza = await prisma.diningArea.create({ data: { branchId: branch.id, name: "Terraza" } });

  await prisma.table.createMany({
    data: [
      { branchId: branch.id, diningAreaId: areaSalon.id, name: "M1", capacity: 2 },
      { branchId: branch.id, diningAreaId: areaSalon.id, name: "M2", capacity: 4 },
      { branchId: branch.id, diningAreaId: areaSalon.id, name: "M3", capacity: 4 },
      { branchId: branch.id, diningAreaId: areaSalon.id, name: "M4", capacity: 6 },
      { branchId: branch.id, diningAreaId: areaTerraza.id, name: "T1", capacity: 4 },
      { branchId: branch.id, diningAreaId: areaTerraza.id, name: "T2", capacity: 4 },
    ],
  });

  await prisma.staff.createMany({
    data: [
      { companyId, branchId: branch.id, name: "Mesero 1", role: StaffRole.waiter },
      { companyId, branchId: branch.id, name: "Mesero 2", role: StaffRole.waiter },
      { companyId, branchId: branch.id, name: "Cocina", role: StaffRole.kitchen },
    ],
  });

  const cocina = await prisma.kdsStation.create({ data: { branchId: branch.id, name: "Cocina" } });
  const barra = await prisma.kdsStation.create({ data: { branchId: branch.id, name: "Barra" } });

  await prisma.kdsRoutingRule.createMany({
    data: [
      { branchId: branch.id, stationId: cocina.id, course: "main" },
      { branchId: branch.id, stationId: cocina.id, course: "appetizer" },
      { branchId: branch.id, stationId: cocina.id, course: "dessert" },
      { branchId: branch.id, stationId: barra.id, course: "drink" },
    ],
  });

  const warehouse = await prisma.warehouse.create({
    data: { branchId: branch.id, name: "Bodega", isDefault: true },
  });

  let sortOrder = 1;
  for (const group of PILOT_YALL.menu) {
    const category = await prisma.category.create({
      data: { branchId: branch.id, name: group.cat, sortOrder: sortOrder++, color: group.color },
    });

    for (const item of group.items) {
      const [name, price, barcode] = item;
      const ivaTaxCode = resolvePilotItemTax(group, item);
      const consumptionTaxCode = resolvePilotItemConsumptionTax(group, item);
      const product = await prisma.product.create({
        data: {
          branchId: branch.id,
          categoryId: category.id,
          name,
          type: ProductType.standard,
          ivaTaxCode,
          consumptionTaxCode,
          course: group.course,
          variants: {
            create: {
              name,
              barcode,
              price,
              cost: Math.round(Number(price) * 0.38),
            },
          },
        },
        include: { variants: true },
      });

      await prisma.stockLevel.create({
        data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 500 },
      });
    }
  }

  const recipeSeed = await seedPilotIngredientsAndRecipes(prisma, branch.id, warehouse.id);
  console.log(`   Insumos: ${recipeSeed.ingredientsCreated} · Recetas: ${recipeSeed.recipesLinked}`);

  const cashRegister = await prisma.cashRegister.create({
    data: { branchId: branch.id, name: "Caja principal" },
  });

  const openSession = await prisma.posSession.findFirst({
    where: { branchId: branch.id, status: PosSessionStatus.open },
  });
  if (!openSession) {
    await prisma.posSession.create({
      data: {
        branchId: branch.id,
        cashRegisterId: cashRegister.id,
        userId: tenantUserId,
        status: PosSessionStatus.open,
        openingCash: 150000,
      },
    });
  }

  return branch;
}

async function main() {
  const cfg = PILOT_YALL;

  const tenant = await prisma.tenant.upsert({
    where: { slug: cfg.tenant.slug },
    update: { name: cfg.tenant.name },
    create: { name: cfg.tenant.name, slug: cfg.tenant.slug, plan: "professional" },
  });

  const user = await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: cfg.user.email } },
    update: { name: cfg.user.name },
    create: {
      tenantId: tenant.id,
      email: cfg.user.email,
      name: cfg.user.name,
      role: "owner",
      passwordHash: hashPassword(cfg.user.password),
    },
  });

  await prisma.user.upsert({
    where: { tenantId_email: { tenantId: tenant.id, email: cfg.waiterUser.email } },
    update: {
      name: cfg.waiterUser.name,
      role: "waiter",
      passwordHash: hashPassword(cfg.waiterUser.password),
    },
    create: {
      tenantId: tenant.id,
      email: cfg.waiterUser.email,
      name: cfg.waiterUser.name,
      role: "waiter",
      passwordHash: hashPassword(cfg.waiterUser.password),
    },
  });

  const company = await prisma.company.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: cfg.company.name } },
    update: {
      nit: cfg.company.nit,
      dv: cfg.company.dv,
      razonSocial: cfg.company.razonSocial,
      email: cfg.company.email,
      city: cfg.company.city,
      department: cfg.company.department,
      vertical: BusinessVertical.restaurant,
    },
    create: {
      tenantId: tenant.id,
      name: cfg.company.name,
      nit: cfg.company.nit,
      dv: cfg.company.dv,
      razonSocial: cfg.company.razonSocial,
      vertical: BusinessVertical.restaurant,
      email: cfg.company.email,
      phone: cfg.company.phone || null,
      address: cfg.company.address || null,
      city: cfg.company.city,
      department: cfg.company.department,
    },
  });

  await prisma.taxDefinition.createMany({
    data: COLOMBIA_DEFAULT_TAXES.map((t) => ({
      companyId: company.id,
      kind: t.kind as TaxKind,
      code: t.code,
      name: t.name,
      rate: t.rate,
      isDefault: t.isDefault,
      sortOrder: t.sortOrder,
      isActive: true,
    })),
    skipDuplicates: true,
  });

  const existingResolution = await prisma.fiscalResolution.findFirst({
    where: { companyId: company.id, docType: FiscalDocType.pos_equivalent, isActive: true },
  });

  if (!existingResolution) {
    await prisma.fiscalResolution.create({
      data: {
        companyId: company.id,
        docType: FiscalDocType.pos_equivalent,
        prefix: cfg.fiscal.prefix,
        fromNumber: cfg.fiscal.fromNumber,
        toNumber: cfg.fiscal.toNumber,
        currentNumber: 0,
        validFrom: new Date(cfg.fiscal.validFrom),
        validTo: new Date(cfg.fiscal.validTo),
        technicalKey: cfg.fiscal.technicalKey,
      },
    });
  }

  const branch = await seedRestaurantBranch(company.id, user.id);

  console.log("");
  console.log("✅ YallPos — Piloto Restaurante de Yall");
  console.log("────────────────────────────────────────");
  console.log("Negocio:  ", cfg.company.razonSocial);
  console.log("NIT:      ", cfg.company.nit);
  console.log("Login admin:", cfg.user.email, "/", cfg.user.password);
  console.log("Login mesero:", cfg.waiterUser.email, "/", cfg.waiterUser.password, "(solo Mesas + Comanda)");
  console.log("Sucursal: ", branch.name);
  console.log("BranchId: ", branch.id);
  console.log("Prefijo:  ", cfg.fiscal.prefix, "(DE POS provisional — actualizar con resolución DIAN)");
  console.log("Certificado:", cfg.certificate.status === "pending" ? "⏳ ESPERANDO" : "✅ Listo");
  console.log("Fiscal:   ", "simulacion (cambiar a habilitacion cuando llegue .p12)");
  console.log("");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
