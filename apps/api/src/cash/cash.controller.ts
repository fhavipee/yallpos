import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthUser, CASH_ROLES } from "../auth/auth.types";
import { CashService } from "./cash.service";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";
import { CreateCashMovementDto } from "./dto/create-cash-movement.dto";

@Controller("v1/cash")
@Roles(...CASH_ROLES)
export class CashController {
  constructor(private cash: CashService) {}

  @Get("registers")
  registers(@BranchId() branchId: string) {
    return this.cash.listRegisters(branchId);
  }

  @Get("sessions")
  sessions(@BranchId() branchId: string, @Query("take") take?: string) {
    return this.cash.listSessions(branchId, take ? Number(take) : 20);
  }

  @Get("session/open")
  getOpen(@BranchId() branchId: string) {
    return this.cash.getOpenSession(branchId);
  }

  @Post("session/open")
  open(@BranchId() branchId: string, @Body() dto: OpenCashSessionDto) {
    return this.cash.openSession(branchId, dto);
  }

  @Post("session/:id/movements")
  addMovement(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body() dto: CreateCashMovementDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.cash.addMovement(branchId, id, dto, user.id);
  }

  @Post("session/:id/close")
  close(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: CloseCashSessionDto) {
    return this.cash.closeSession(branchId, id, dto);
  }

  @Get("session/:id/report")
  report(@BranchId() branchId: string, @Param("id") id: string) {
    return this.cash.getSessionReport(branchId, id);
  }

  @Get("session/:id/report-x")
  reportX(@BranchId() branchId: string, @Param("id") id: string) {
    return this.cash.getSessionReport(branchId, id);
  }

  @Get("session/:id/report-z")
  reportZ(@BranchId() branchId: string, @Param("id") id: string) {
    return this.cash.getSessionReport(branchId, id);
  }

  @Get("session/:id/report.escpos")
  async reportEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.buildEscPosPayload(branchId, id);
  }

  @Get("session/:id/report-x.escpos")
  async reportXEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.buildEscPosPayload(branchId, id);
  }

  @Get("session/:id/report-z.escpos")
  async reportZEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.buildEscPosPayload(branchId, id);
  }

  private async buildEscPosPayload(branchId: string, id: string) {
    const report = await this.cash.getSessionReport(branchId, id);
    const { buildEscPosCashReport } = await import("../print/escpos.encoder");
    const localeOpts = { timeZone: "America/Bogota" } as const;
    const buf = buildEscPosCashReport({
      reportType: report.reportType as "X" | "Z",
      businessName: report.businessName,
      branchName: report.branchName,
      cashRegisterName: report.cashRegisterName,
      openedAt: new Date(report.openedAt).toLocaleString("es-CO", localeOpts),
      closedAt: report.closedAt
        ? new Date(report.closedAt).toLocaleString("es-CO", localeOpts)
        : null,
      openingCash: report.openingCash,
      closingCash: report.closingCash,
      cashDifference: report.cashDifference,
      totalSales: report.totalSales,
      totalTips: report.totalTips,
      expectedCash: report.expectedCash,
      cashSales: report.cashSales,
      deposits: report.deposits,
      withdrawals: report.withdrawals,
      expenses: report.expenses,
      invoiceCount: report.invoiceCount,
      paymentsByMethod: report.paymentsByMethod,
      movements: report.movements,
      notes: report.notes,
      printedAt: new Date().toLocaleString("es-CO", localeOpts),
    });
    return { base64: buf.toString("base64"), bytes: buf.length };
  }
}
