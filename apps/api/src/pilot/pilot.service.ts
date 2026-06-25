import { Injectable, NotFoundException } from "@nestjs/common";
import { ProductType } from "@prisma/client";
import { PILOT_YALL, resolvePilotItemConsumptionTax, resolvePilotItemTax } from "../config/pilot-yall.config";
import { seedPilotIngredientsAndRecipes } from "../config/pilot-recipes.util";
import { PrismaService } from "../prisma/prisma.service";
import { PosService } from "../pos/pos.service";
import { RestaurantService } from "../restaurant/restaurant.service";
import { CashService } from "../cash/cash.service";
import { KdsService } from "../kds/kds.service";
import { OnboardingService } from "../onboarding/onboarding.service";

@Injectable()
export class PilotService {
  constructor(
    private prisma: PrismaService,
    private pos: PosService,
    private restaurant: RestaurantService,
    private cash: CashService,
    private kds: KdsService,
    private onboarding: OnboardingService,
  ) {}

  async syncMenu() {
    const cfg = PILOT_YALL;

    const tenant = await this.prisma.tenant.findUnique({ where: { slug: cfg.tenant.slug } });
    if (!tenant) throw new NotFoundException("Tenant piloto no encontrado");

    const company = await this.prisma.company.findFirst({
      where: { tenantId: tenant.id, name: cfg.company.name },
    });
    if (!company) throw new NotFoundException("Empresa piloto no encontrada");

    const branch = await this.prisma.branch.findFirst({
      where: { companyId: company.id, name: cfg.branch.name },
    });
    if (!branch) throw new NotFoundException("Sucursal piloto no encontrada");

    const warehouse = await this.prisma.warehouse.findFirst({
      where: { branchId: branch.id, isDefault: true },
    });
    if (!warehouse) throw new NotFoundException("Bodega no encontrada");

    let created = 0;
    let updated = 0;
    let deactivated = 0;
    let sortOrder = 1;
    const activeBarcodes: string[] = [];

    for (const group of cfg.menu) {
      let category = await this.prisma.category.findFirst({
        where: { branchId: branch.id, name: group.cat },
      });

      if (!category) {
        category = await this.prisma.category.create({
          data: {
            branchId: branch.id,
            name: group.cat,
            sortOrder: sortOrder++,
            color: group.color,
          },
        });
      } else {
        await this.prisma.category.update({
          where: { id: category.id },
          data: { color: group.color, sortOrder: sortOrder++ },
        });
      }

      for (const item of group.items) {
        const [name, price, barcode] = item;
        const ivaTaxCode = resolvePilotItemTax(group, item);
        const consumptionTaxCode = resolvePilotItemConsumptionTax(group, item);
        activeBarcodes.push(barcode);
        const existingVariant = await this.prisma.productVariant.findFirst({
          where: { barcode, product: { branchId: branch.id } },
          include: { product: true },
        });

        if (existingVariant) {
          await this.prisma.productVariant.update({
            where: { id: existingVariant.id },
            data: { price, name, cost: Math.round(price * 0.38) },
          });
          await this.prisma.product.update({
            where: { id: existingVariant.productId },
            data: { name, categoryId: category.id, course: group.course, isActive: true, ivaTaxCode, consumptionTaxCode },
          });
          updated++;
          continue;
        }

        const product = await this.prisma.product.create({
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
                cost: Math.round(price * 0.38),
              },
            },
          },
          include: { variants: true },
        });

        await this.prisma.stockLevel.create({
          data: { warehouseId: warehouse.id, variantId: product.variants[0].id, quantity: 500 },
        });
        created++;
      }
    }

    const obsolete = await this.prisma.productVariant.findMany({
      where: {
        barcode: { startsWith: "7703" },
        product: { branchId: branch.id, isActive: true },
      },
      select: { id: true, barcode: true, productId: true },
    });

    for (const variant of obsolete) {
      if (variant.barcode && !activeBarcodes.includes(variant.barcode)) {
        await this.prisma.product.update({
          where: { id: variant.productId },
          data: { isActive: false },
        });
        deactivated++;
      }
    }

    const productCount = await this.prisma.product.count({ where: { branchId: branch.id, isActive: true } });
    const recipeSeed = await seedPilotIngredientsAndRecipes(this.prisma, branch.id, warehouse.id);

    return {
      branchId: branch.id,
      branchName: branch.name,
      created,
      updated,
      deactivated,
      activeProducts: productCount,
      menuCategories: cfg.menu.length,
      menuItems: activeBarcodes.length,
      ingredientsCreated: recipeSeed.ingredientsCreated,
      recipesLinked: recipeSeed.recipesLinked,
    };
  }

  async simulateOperationalFlow(branchId: string) {
    const steps: { step: string; ok: boolean; detail?: string }[] = [];
    const push = (step: string, ok: boolean, detail?: string) => steps.push({ step, ok, detail });

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: { include: { users: { take: 1 } } } } } },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");

    const companyId = branch.companyId;
    const userId = branch.company.tenant.users[0]?.id;
    if (!userId) throw new NotFoundException("Usuario no encontrado para abrir caja");

    try {
      const productCount = await this.prisma.product.count({ where: { branchId, isActive: true } });
      if (productCount < 20) {
        const menu = await this.syncMenu();
        if (menu.branchId !== branchId) {
          push("Menú piloto", false, "Ejecute sync en la sucursal Restaurante de Yall");
        } else {
          push("Menú piloto sincronizado", true, `${menu.activeProducts} productos activos`);
        }
      } else {
        push("Menú cargado", true, `${productCount} productos activos`);
      }
    } catch (err: any) {
      push("Menú piloto", false, err.message);
    }

    let cashSession = await this.cash.getOpenSession(branchId);
    if (!cashSession) {
      const opened = await this.cash.openSession(branchId, {
        userId,
        openingCash: 200_000,
      });
      cashSession = await this.cash.getOpenSession(branchId);
      push("Caja abierta", true, `Base $200.000 · sesión ${opened.id.slice(0, 8)}…`);
    } else {
      push("Caja abierta", true, "Sesión existente reutilizada");
    }

    const reservedFor = new Date(Date.now() + 45 * 60_000);
    const reservation = await this.restaurant.createReservation(branchId, {
      customerName: "Cliente Piloto",
      customerPhone: "3005551234",
      guestsCount: 2,
      reservedFor: reservedFor.toISOString(),
      notes: "Simulación automática go-live",
    });
    push("Reserva de prueba", true, reservation.customerName);

    const tables = await this.restaurant.getTables(branchId);
    const freeTable =
      tables.find((t: any) => t.name === "M2" && !(t.sessions?.length)) ??
      tables.find((t: any) => !(t.sessions?.length));
    if (!freeTable) throw new NotFoundException("No hay mesas libres para la simulación");

    const waiters = await this.restaurant.getWaiters(branchId);
    const waiter = waiters[0];
    if (!waiter) throw new NotFoundException("No hay meseros configurados");

    const tableSession = await this.restaurant.openTableSession(
      branchId,
      { tableId: freeTable.id, waiterId: waiter.id, guestsCount: 2 },
      userId,
    );
    push("Mesa abierta", true, `${freeTable.area?.name ?? "Salón"} · Mesa ${freeTable.name}`);

    const invoice = await this.pos.getOrCreateDraftByTableSession(branchId, companyId, tableSession.id);
    const variant =
      (await this.prisma.productVariant.findFirst({
        where: {
          product: { branchId, isActive: true, name: { contains: "Croquetas", mode: "insensitive" } },
        },
      })) ??
      (await this.prisma.productVariant.findFirst({
        where: { product: { branchId, isActive: true } },
        orderBy: { product: { name: "asc" } },
      }));
    if (!variant) throw new NotFoundException("Sin productos en catálogo");

    await this.pos.addLine(branchId, invoice.id, {
      variantId: variant.id,
      qty: "1",
      unitPrice: String(variant.price),
      name: variant.name,
    });
    push("Producto en comanda", true, variant.name);

    await this.pos.sendToKitchen(branchId, invoice.id);
    push("Enviado a cocina", true, `Comanda ${invoice.id.slice(0, 8)}…`);

    const ticket = await this.prisma.kdsTicket.findFirst({
      where: { branchId, invoiceId: invoice.id },
      include: { items: true },
    });
    if (ticket) {
      for (const item of ticket.items) {
        await this.kds.updateItemStatus(branchId, item.id, "ready");
      }
      push("KDS marcado listo", true, `${ticket.items.length} ítem(s)`);
    } else {
      push("KDS marcado listo", false, "Sin ticket KDS");
    }

    await this.pos.markTableServed(branchId, invoice.id);
    push("Mesa marcada servida", true, `Mesa ${freeTable.name}`);

    const updatedInvoice = await this.pos.getInvoice(branchId, invoice.id);
    const tableTotal = Number(updatedInvoice?.total ?? 0);
    await this.pos.pay(branchId, invoice.id, {
      payments: [{ method: "cash", amount: String(tableTotal) }],
    });
    push("Cobro de mesa", true, `$${Math.round(tableTotal).toLocaleString("es-CO")}`);

    const counterInvoice = await this.pos.createCounterSale(branchId, companyId);
    await this.pos.addLine(branchId, counterInvoice.id, {
      variantId: variant.id,
      qty: "1",
      unitPrice: String(variant.price),
    });
    const counterUpdated = await this.pos.getInvoice(branchId, counterInvoice.id);
    const counterTotal = Number(counterUpdated?.total ?? 0);
    await this.pos.pay(branchId, counterInvoice.id, {
      payments: [{ method: "cash", amount: String(counterTotal) }],
    });
    push("Venta mostrador", true, `$${Math.round(counterTotal).toLocaleString("es-CO")}`);

    const openBeforeClose = await this.cash.getOpenSession(branchId);
    if (openBeforeClose) {
      const report = await this.cash.getReportX(branchId, openBeforeClose.id);
      await this.cash.closeSession(branchId, openBeforeClose.id, {
        closingCash: report.expectedCash,
        notes: "Cierre simulación piloto",
      });
      push(
        "Cierre de caja (Reporte X)",
        true,
        `Efectivo esperado $${Math.round(report.expectedCash).toLocaleString("es-CO")}`,
      );

      await this.cash.openSession(branchId, { userId, openingCash: 200_000 });
      push("Caja reabierta", true, "Lista para operación real");
    }

    await this.onboarding.updateOperationalChecklistItem(branchId, "print_test", true);

    const checklist = await this.onboarding.getOperationalChecklist(branchId);

    return {
      ok: checklist.ready,
      steps,
      checklist,
      summary: {
        table: freeTable.name,
        waiter: waiter.name,
        product: variant.name,
        reservationId: reservation.id,
        tableSessionId: tableSession.id,
      },
    };
  }
}
