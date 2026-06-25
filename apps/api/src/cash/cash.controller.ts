import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CASH_ROLES } from "../auth/auth.types";
import { CashService } from "./cash.service";
import { OpenCashSessionDto } from "./dto/open-cash-session.dto";
import { CloseCashSessionDto } from "./dto/close-cash-session.dto";

@Controller("v1/cash")
@Roles(...CASH_ROLES)
export class CashController {
  constructor(private cash: CashService) {}

  @Get("session/open")
  getOpen(@BranchId() branchId: string) {
    return this.cash.getOpenSession(branchId);
  }

  @Post("session/open")
  open(@BranchId() branchId: string, @Body() dto: OpenCashSessionDto) {
    return this.cash.openSession(branchId, dto);
  }

  @Post("session/:id/close")
  close(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: CloseCashSessionDto) {
    return this.cash.closeSession(branchId, id, dto);
  }

  @Get("session/:id/report-x")
  reportX(@BranchId() branchId: string, @Param("id") id: string) {
    return this.cash.getReportX(branchId, id);
  }

  @Get("session/:id/report-x.escpos")
  async reportXEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    const report = await this.cash.getReportX(branchId, id);
    const { buildEscPosReportX } = await import("../print/escpos.encoder");
    const buf = buildEscPosReportX({
      businessName: report.businessName,
      branchName: report.branchName,
      openedAt: new Date(report.openedAt).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
      openingCash: report.openingCash,
      totalSales: report.totalSales,
      totalTips: report.totalTips,
      expectedCash: report.expectedCash,
      invoiceCount: report.invoiceCount,
      paymentsByMethod: report.paymentsByMethod,
      printedAt: new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    });
    return { base64: buf.toString("base64"), bytes: buf.length };
  }
}
