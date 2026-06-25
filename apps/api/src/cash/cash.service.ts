import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  async getOpenSession(branchId: string) {
    return this.prisma.posSession.findFirst({
      where: { branchId, status: "open" },
      include: { movements: true, invoices: { where: { status: "paid" } } },
    });
  }

  async openSession(branchId: string, dto: OpenCashSessionDto) {
    const existing = await this.getOpenSession(branchId);
    if (existing) throw new BadRequestException("Ya hay una caja abierta");

    return this.prisma.posSession.create({
      data: {
        branchId,
        userId: dto.userId,
        cashRegisterId: dto.cashRegisterId ?? null,
        status: "open",
        openingCash: dto.openingCash,
      },
    });
  }

  async closeSession(branchId: string, sessionId: string, dto: CloseCashSessionDto) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: sessionId, branchId, status: "open" },
      include: { invoices: { where: { status: "paid" }, include: { payments: true } } },
    });
    if (!session) throw new NotFoundException("Sesión de caja no encontrada");

    const cashSales = session.invoices
      .flatMap((i) => i.payments)
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const expectedCash = Number(session.openingCash) + cashSales;
    const difference = Number(dto.closingCash) - expectedCash;

    return this.prisma.posSession.update({
      where: { id: sessionId },
      data: {
        status: "closed",
        closedAt: new Date(),
        closingCash: dto.closingCash,
        expectedCash,
        cashDifference: difference,
        notes: dto.notes ?? null,
      },
    });
  }

  async getReportX(branchId: string, sessionId: string) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: sessionId, branchId },
      include: {
        branch: { include: { company: true } },
        invoices: {
          where: { status: "paid" },
          include: { payments: true, lines: true },
        },
        movements: true,
      },
    });
    if (!session) throw new NotFoundException("Sesión no encontrada");

    const totalSales = session.invoices.reduce((s, i) => s + Number(i.total), 0);
    const totalTips = session.invoices.reduce((s, i) => s + Number(i.tipAmount ?? 0), 0);
    const byMethod: Record<string, number> = {};
    for (const inv of session.invoices) {
      for (const p of inv.payments) {
        byMethod[p.method] = (byMethod[p.method] ?? 0) + Number(p.amount);
      }
    }

    const cashIn = byMethod.cash ?? 0;
    const expectedCash = Number(session.openingCash) + cashIn;

    return {
      sessionId: session.id,
      status: session.status,
      businessName: session.branch.company.razonSocial ?? session.branch.company.name,
      branchName: session.branch.name,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingCash: Number(session.openingCash),
      totalSales,
      totalTips,
      expectedCash,
      invoiceCount: session.invoices.length,
      paymentsByMethod: byMethod,
      movements: session.movements,
    };
  }
}
