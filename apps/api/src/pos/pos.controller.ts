import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CASH_ROLES, FLOOR_ROLES } from "../auth/auth.types";
import { PosService } from "./pos.service";
import { CreateInvoiceDto } from "./dto/create-invoice.dto";
import { AddLineDto } from "./dto/add-line.dto";
import { UpdateLineNoteDto } from "./dto/update-line-note.dto";
import { UpdateLineQtyDto } from "./dto/update-line-qty.dto";
import { UpdateDeliveryDto } from "./dto/update-delivery.dto";
import { UpdatePickupDto } from "./dto/update-pickup.dto";
import { PayInvoiceDto } from "./dto/pay-invoice.dto";
import { SplitInvoiceDto } from "./dto/split-invoice.dto";
import { PrismaService } from "../prisma/prisma.service";

@Controller("v1/pos")
export class PosController {
  constructor(private service: PosService, private prisma: PrismaService) {}

  private async getCompanyIdForBranch(branchId: string): Promise<string> {
    const b = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!b) throw new Error("Invalid branchId");
    return b.companyId;
  }

  @Roles(...CASH_ROLES)
  @Get("pickup-queue")
  getPickupQueue(@BranchId() branchId: string) {
    return this.service.getPickupQueue(branchId);
  }

  @Roles(...FLOOR_ROLES)
  @Get("table-ready-queue")
  getTableReadyQueue(@BranchId() branchId: string) {
    return this.service.getTableReadyQueue(branchId);
  }

  @Roles(...CASH_ROLES)
  @Get("host-board")
  getHostBoard(@BranchId() branchId: string) {
    return this.service.getHostBoard(branchId);
  }

  @Roles(...CASH_ROLES)
  @Get("delivery-queue")
  getDeliveryQueue(@BranchId() branchId: string) {
    return this.service.getDeliveryQueue(branchId);
  }

  @Roles(...CASH_ROLES)
  @Get("invoices/open-counter")
  listOpenCounterInvoices(@BranchId() branchId: string) {
    return this.service.listOpenCounterInvoices(branchId);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/open-counter/void-stale")
  voidStaleOpenCounterInvoices(@BranchId() branchId: string, @Query("hours") hours?: string) {
    return this.service.voidStaleOpenCounterInvoices(branchId, hours ? Number(hours) : 4);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/:id/void")
  voidOpenInvoice(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body() body?: { reason?: string },
  ) {
    return this.service.voidOpenInvoice(branchId, id, body?.reason);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/counter")
  async createCounterSale(@BranchId() branchId: string) {
    const companyId = await this.getCompanyIdForBranch(branchId);
    return this.service.createCounterSale(branchId, companyId);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/takeaway")
  async createTakeawaySale(@BranchId() branchId: string) {
    const companyId = await this.getCompanyIdForBranch(branchId);
    return this.service.createTakeawaySale(branchId, companyId);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices")
  async createInvoice(@BranchId() branchId: string, @Body() dto: CreateInvoiceDto) {
    const companyId = await this.getCompanyIdForBranch(branchId);
    return this.service.createInvoice(branchId, companyId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get("table-sessions/:tableSessionId/invoices")
  listTableInvoices(@BranchId() branchId: string, @Param("tableSessionId") tableSessionId: string) {
    return this.service.listOpenInvoicesForTableSession(branchId, tableSessionId);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/by-table-session/:tableSessionId")
  async getOrCreateByTableSession(
    @BranchId() branchId: string,
    @Param("tableSessionId") tableSessionId: string,
    @Query("invoiceId") invoiceId?: string,
  ) {
    const companyId = await this.getCompanyIdForBranch(branchId);
    return this.service.getOrCreateDraftByTableSession(branchId, companyId, tableSessionId, invoiceId);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/add-line")
  addLine(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: AddLineDto) {
    return this.service.addLine(branchId, id, dto);
  }

  @Roles(...CASH_ROLES)
  @Patch("invoices/:id/pickup")
  updatePickup(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpdatePickupDto) {
    return this.service.updatePickup(branchId, id, dto);
  }

  @Roles(...CASH_ROLES)
  @Get("invoices/:id/pickup-notify")
  getPickupNotify(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.getPickupNotifyStatus(branchId, id);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/:id/pickup-notify")
  notifyPickup(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.notifyPickupReady(branchId, id);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/:id/pickup-delivered")
  markPickupDelivered(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.markPickupDelivered(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/mark-table-served")
  markTableServed(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.markTableServed(branchId, id);
  }

  @Roles(...CASH_ROLES)
  @Patch("invoices/:id/delivery")
  updateDelivery(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpdateDeliveryDto) {
    return this.service.updateDelivery(branchId, id, dto);
  }

  @Roles(...CASH_ROLES)
  @Post("invoices/:id/delivery-status/:status")
  updateDeliveryStatus(@BranchId() branchId: string, @Param("id") id: string, @Param("status") status: string) {
    return this.service.updateDeliveryStatus(branchId, id, status);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/send-to-kitchen")
  sendToKitchen(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.sendToKitchen(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/lines/:lineId/remove")
  removeLine(@BranchId() branchId: string, @Param("id") id: string, @Param("lineId") lineId: string) {
    return this.service.removeLine(branchId, id, lineId);
  }

  @Roles(...FLOOR_ROLES)
  @Patch("invoices/:id/lines/:lineId/qty")
  updateLineQty(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateLineQtyDto,
  ) {
    return this.service.updateLineQty(branchId, id, lineId, dto.qty);
  }

  @Roles(...FLOOR_ROLES)
  @Patch("invoices/:id/lines/:lineId/note")
  updateLineNote(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Param("lineId") lineId: string,
    @Body() dto: UpdateLineNoteDto,
  ) {
    return this.service.updateLineNote(branchId, id, lineId, dto.lineNotes ?? "");
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/split")
  splitInvoice(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: SplitInvoiceDto) {
    return this.service.splitInvoice(branchId, id, dto.lineIds);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/pay")
  pay(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: PayInvoiceDto) {
    return this.service.pay(branchId, id, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id")
  getInvoice(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.getInvoice(branchId, id);
  }
}
