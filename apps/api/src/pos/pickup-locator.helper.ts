import { PrismaService } from "../prisma/prisma.service";

/** Libera el localizador cuando todos los ítems KDS del pedido están entregados. */
export async function releasePickupLocatorIfComplete(
  prisma: PrismaService,
  branchId: string,
  invoiceId: string,
): Promise<boolean> {
  const invoice = await prisma.salesInvoice.findFirst({
    where: {
      id: invoiceId,
      branchId,
      serviceType: { in: ["counter", "takeaway"] },
      pickupCode: { not: null },
      pickupDeliveredAt: null,
      voidedAt: null,
    },
    select: { id: true },
  });
  if (!invoice) return false;

  const ticket = await prisma.kdsTicket.findFirst({
    where: { branchId, invoiceId },
    include: { items: true },
  });
  if (!ticket) return false;

  const active = ticket.items.filter((item) => item.status !== "canceled");
  if (active.length === 0 || !active.every((item) => item.status === "served")) {
    return false;
  }

  await prisma.salesInvoice.update({
    where: { id: invoiceId },
    data: { pickupDeliveredAt: new Date() },
  });
  return true;
}

/** Libera localizadores bloqueados por pedidos ya despachados en cocina. */
export async function releaseStalePickupLocatorsForCode(
  prisma: PrismaService,
  branchId: string,
  pickupCode: string,
  excludeInvoiceId: string,
): Promise<void> {
  const stale = await prisma.salesInvoice.findMany({
    where: {
      branchId,
      id: { not: excludeInvoiceId },
      pickupCode,
      pickupDeliveredAt: null,
      voidedAt: null,
      serviceType: { in: ["counter", "takeaway"] },
      status: { in: ["draft", "sent_to_kitchen", "paid"] },
    },
    select: { id: true },
  });

  for (const row of stale) {
    await releasePickupLocatorIfComplete(prisma, branchId, row.id);
  }
}

/** Libera localizadores de pedidos activos del día que ya fueron despachados en cocina. */
export async function sweepReleasedPickupLocators(prisma: PrismaService, branchId: string): Promise<void> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const candidates = await prisma.salesInvoice.findMany({
    where: {
      branchId,
      serviceType: { in: ["counter", "takeaway"] },
      pickupCode: { not: null },
      pickupDeliveredAt: null,
      voidedAt: null,
      status: { in: ["draft", "sent_to_kitchen", "paid"] },
      createdAt: { gte: start },
    },
    select: { id: true },
  });

  for (const row of candidates) {
    await releasePickupLocatorIfComplete(prisma, branchId, row.id);
  }
}
