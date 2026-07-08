import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { KITCHEN_ROLES } from "../auth/auth.types";
import { KdsService } from "./kds.service";

@Controller("v1/kds")
@Roles(...KITCHEN_ROLES)
export class KdsController {
  constructor(private service: KdsService) {}

  @Get("stations")
  getStations(@BranchId() branchId: string) {
    return this.service.getStations(branchId);
  }

  @Get("items")
  getItems(@BranchId() branchId: string, @Query("stationId") stationId: string, @Query("status") status?: string) {
    return this.service.getItemsByStation(branchId, stationId, status);
  }

  @Post("items/:id/status/:status")
  updateStatus(@BranchId() branchId: string, @Param("id") id: string, @Param("status") status: any) {
    return this.service.updateItemStatus(branchId, id, status);
  }

  @Post("invoices/:invoiceId/mark-preparing")
  markInvoicePreparing(@BranchId() branchId: string, @Param("invoiceId") invoiceId: string) {
    return this.service.markInvoicePreparing(branchId, invoiceId);
  }

  @Post("invoices/:invoiceId/mark-ready")
  markInvoiceReady(@BranchId() branchId: string, @Param("invoiceId") invoiceId: string) {
    return this.service.markInvoiceReady(branchId, invoiceId);
  }

  @Post("invoices/:invoiceId/mark-served")
  markInvoiceServed(@BranchId() branchId: string, @Param("invoiceId") invoiceId: string) {
    return this.service.markInvoiceServedFromKds(branchId, invoiceId);
  }
}
