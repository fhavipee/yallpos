import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";
import { CreateCashMovementDto } from "./dto/create-cash-movement.dto";

type MovementLike = { type: string; amount: unknown };

@Injectable()
export class CashService {
  constructor(private prisma: PrismaService) {}

  /** expected = apertura + ventas efectivo + depósitos − retiros − gastos */
  computeExpectedCash(openingCash: number, cashSales: number, movements: MovementLike[]) {
    let deposits = 0;
    let outflows = 0;
    for (const m of movements) {
      const amt = Number(m.amount);
      if (m.type === "deposit") deposits += amt;
      else if (m.type === "withdrawal" || m.type === "expense") outflows += amt;
    }
    return {
      cashSales,
      deposits,
      withdrawals: movements.filter((m) => m.type === "withdrawal").reduce((s, m) => s + Number(m.amount), 0),
      expenses: movements.filter((m) => m.type === "expense").reduce((s, m) => s + Number(m.amount), 0),
      expectedCash: openingCash + cashSales + deposits - outflows,
    };
  }

  async getOpenSession(branchId: string) {
    return this.prisma.posSession.findFirst({
      where: { branchId, status: "open" },
      include: {
        movements: { orderBy: { createdAt: "desc" } },
        cashRegister: true,
        invoices: { where: { status: "paid" }, include: { payments: true } },
      },
    });
  }

  async listRegisters(branchId: string) {
    return this.prisma.cashRegister.findMany({
      where: { branchId, isActive: true },
      orderBy: { name: "asc" },
    });
  }

  async listSessions(branchId: string, take = 20) {
    const sessions = await this.prisma.posSession.findMany({
      where: { branchId },
      orderBy: { openedAt: "desc" },
      take: Math.min(take, 50),
      include: {
        cashRegister: true,
        movements: true,
        invoices: { where: { status: "paid" }, include: { payments: true } },
      },
    });

    return sessions.map((s) => {
      const cashSales = s.invoices
        .flatMap((i) => i.payments)
        .filter((p) => p.method === "cash")
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const totals = this.computeExpectedCash(Number(s.openingCash), cashSales, s.movements);
      return {
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        cashRegisterId: s.cashRegisterId,
        cashRegisterName: s.cashRegister?.name ?? null,
        openingCash: Number(s.openingCash),
        closingCash: Number(s.closingCash),
        cashDifference: Number(s.cashDifference),
        invoiceCount: s.invoices.length,
        notes: s.notes,
        cashSales: totals.cashSales,
        deposits: totals.deposits,
        withdrawals: totals.withdrawals,
        expenses: totals.expenses,
        expectedCash: s.status === "closed" ? Number(s.expectedCash) : totals.expectedCash,
      };
    });
  }

  async openSession(branchId: string, dto: OpenCashSessionDto) {
    const existing = await this.getOpenSession(branchId);
    if (existing) throw new BadRequestException("Ya hay una caja abierta");

    if (dto.cashRegisterId) {
      const reg = await this.prisma.cashRegister.findFirst({
        where: { id: dto.cashRegisterId, branchId, isActive: true },
      });
      if (!reg) throw new BadRequestException("Caja registradora no válida");
    }

    return this.prisma.posSession.create({
      data: {
        branchId,
        userId: dto.userId,
        cashRegisterId: dto.cashRegisterId ?? null,
        status: "open",
        openingCash: dto.openingCash,
      },
      include: { cashRegister: true },
    });
  }

  async addMovement(branchId: string, sessionId: string, dto: CreateCashMovementDto, userId?: string) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: sessionId, branchId, status: "open" },
    });
    if (!session) throw new NotFoundException("Sesión de caja no encontrada o ya cerrada");

    return this.prisma.cashMovement.create({
      data: {
        sessionId,
        type: dto.type,
        amount: dto.amount,
        reason: dto.reason?.trim() || null,
        createdBy: userId ?? null,
      },
    });
  }

  async closeSession(branchId: string, sessionId: string, dto: CloseCashSessionDto) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: sessionId, branchId, status: "open" },
      include: {
        invoices: { where: { status: "paid" }, include: { payments: true } },
        movements: true,
      },
    });
    if (!session) throw new NotFoundException("Sesión de caja no encontrada");

    const cashSales = session.invoices
      .flatMap((i) => i.payments)
      .filter((p) => p.method === "cash")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    const { expectedCash } = this.computeExpectedCash(
      Number(session.openingCash),
      cashSales,
      session.movements,
    );
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
      include: { movements: true, cashRegister: true },
    });
  }

  async getSessionReport(branchId: string, sessionId: string) {
    const session = await this.prisma.posSession.findFirst({
      where: { id: sessionId, branchId },
      include: {
        branch: { include: { company: true } },
        cashRegister: true,
        invoices: {
          where: { status: "paid" },
          include: { payments: true, lines: true },
        },
        movements: { orderBy: { createdAt: "asc" } },
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
    const totals = this.computeExpectedCash(Number(session.openingCash), cashIn, session.movements);
    const expectedCash =
      session.status === "closed" ? Number(session.expectedCash) : totals.expectedCash;

    return {
      sessionId: session.id,
      status: session.status,
      reportType: (session.status === "closed" ? "Z" : "X") as "X" | "Z",
      businessName: session.branch.company.razonSocial ?? session.branch.company.name,
      branchName: session.branch.name,
      cashRegisterName: session.cashRegister?.name ?? null,
      openedAt: session.openedAt,
      closedAt: session.closedAt,
      openingCash: Number(session.openingCash),
      closingCash: session.status === "closed" ? Number(session.closingCash) : null,
      cashDifference: session.status === "closed" ? Number(session.cashDifference) : null,
      totalSales,
      totalTips,
      expectedCash,
      cashSales: totals.cashSales,
      deposits: totals.deposits,
      withdrawals: totals.withdrawals,
      expenses: totals.expenses,
      invoiceCount: session.invoices.length,
      paymentsByMethod: byMethod,
      movements: session.movements.map((m) => ({
        id: m.id,
        type: m.type,
        amount: Number(m.amount),
        reason: m.reason,
        createdAt: m.createdAt,
      })),
      notes: session.notes,
    };
  }

  /** @deprecated alias */
  async getReportX(branchId: string, sessionId: string) {
    return this.getSessionReport(branchId, sessionId);
  }
}
