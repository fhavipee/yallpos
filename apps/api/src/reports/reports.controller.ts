import { Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { MANAGEMENT_ROLES } from "../auth/auth.types";
import { ReportsService } from "./reports.service";

@Controller("v1/reports")
@Roles(...MANAGEMENT_ROLES)
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get("dashboard")
  getDashboard(@BranchId() branchId: string) {
    return this.reports.getDashboard(branchId);
  }

  @Get("cash")
  getCashReport(@BranchId() branchId: string, @Query("sessionId") sessionId?: string) {
    return this.reports.getCashReport(branchId, sessionId);
  }

  @Get("voided-orders")
  getVoidedOrders(@BranchId() branchId: string, @Query("date") date?: string) {
    return this.reports.getVoidedOrdersReport(branchId, date);
  }

  @Get("table-service-times")
  getTableServiceTimes(@BranchId() branchId: string, @Query("date") date?: string) {
    return this.reports.getTableServiceTimes(branchId, date);
  }

  @Get("table-service-times/export")
  async exportTableServiceTimes(
    @BranchId() branchId: string,
    @Query("date") date: string | undefined,
    @Query("format") format: string | undefined,
    @Res() res: Response,
  ) {
    const fmt = format === "html" ? "html" : "csv";
    const exported = await this.reports.exportTableServiceTimes(branchId, fmt, date);
    res.setHeader("Content-Type", exported.contentType);
    if (exported.filename) {
      res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    }
    return res.send(exported.body);
  }

  @Get("table-service-times/weekly")
  getTableServiceTimesWeekly(@BranchId() branchId: string, @Query("weekStart") weekStart?: string) {
    return this.reports.getTableServiceTimesWeekly(branchId, weekStart);
  }

  @Get("table-service-times/weekly/export")
  async exportTableServiceTimesWeekly(
    @BranchId() branchId: string,
    @Query("weekStart") weekStart: string | undefined,
    @Query("format") format: string | undefined,
    @Res() res: Response,
  ) {
    const fmt = format === "html" ? "html" : "csv";
    const exported = await this.reports.exportTableServiceTimesWeekly(branchId, fmt, weekStart);
    res.setHeader("Content-Type", exported.contentType);
    if (exported.filename) {
      res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
    }
    return res.send(exported.body);
  }
}
