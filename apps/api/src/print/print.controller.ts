import { Body, Controller, Get, Param, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { ReceiptService } from "./receipt.service";
import { PrintService } from "./print.service";

import { buildEscPosTest } from "./escpos.encoder";

@Controller("v1/print")
export class PrintController {
  constructor(
    private receipts: ReceiptService,
    private print: PrintService,
  ) {}

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/receipt")
  getReceipt(@BranchId() branchId: string, @Param("id") id: string) {
    return this.receipts.getReceiptData(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/receipt.html")
  async getReceiptHtml(@BranchId() branchId: string, @Param("id") id: string, @Res() res: Response) {
    const html = await this.receipts.getHtmlReceipt(branchId, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/kitchen.html")
  async getKitchenHtml(@BranchId() branchId: string, @Param("id") id: string, @Res() res: Response) {
    const html = await this.receipts.getKitchenHtml(branchId, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/kitchen.escpos")
  getKitchenEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.receipts.getKitchenEscPosBase64(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/kitchen-void.html")
  async getKitchenVoidHtml(@BranchId() branchId: string, @Param("id") id: string, @Res() res: Response) {
    const html = await this.receipts.getKitchenVoidHtml(branchId, id);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/kitchen-void.escpos")
  getKitchenVoidEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.receipts.getKitchenVoidEscPosBase64(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Get("table-sessions/:sessionId/seating.escpos")
  getSeatingEscPos(
    @BranchId() branchId: string,
    @Param("sessionId") sessionId: string,
    @Query("reservationId") reservationId?: string,
  ) {
    return this.receipts.getSeatingSlipEscPosBase64(branchId, sessionId, reservationId);
  }

  @Roles(...FLOOR_ROLES)
  @Get("table-sessions/:sessionId/seating.html")
  async getSeatingHtml(
    @BranchId() branchId: string,
    @Param("sessionId") sessionId: string,
    @Query("reservationId") reservationId: string | undefined,
    @Res() res: Response,
  ) {
    const html = await this.receipts.getSeatingSlipHtml(branchId, sessionId, reservationId);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
  }

  @Roles(...FLOOR_ROLES)
  @Get("invoices/:id/receipt.escpos")
  getEscPos(@BranchId() branchId: string, @Param("id") id: string) {
    return this.receipts.getEscPosBase64(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Post("invoices/:id/print")
  async printInvoice(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body("printerIp") printerIp?: string,
  ) {
    return this.print.printToNetworkPrinter(branchId, id, printerIp);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Get("test.escpos")
  getTestEscPos() {
    const buf = buildEscPosTest();
    return { base64: buf.toString("base64"), bytes: buf.length };
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post("test")
  async testPrint(@Query("printerIp") printerIp?: string) {
    const ip = printerIp ?? process.env.PRINTER_IP;
    if (!ip) return { ok: false, message: "Configure PRINTER_IP en .env" };

    const { buildEscPosReceipt } = await import("./escpos.encoder");
    const buf = buildEscPosReceipt({
      businessName: "YallPos Test",
      nit: "900123456-7",
      branchName: "Sucursal Demo",
      lines: [{ name: "Producto prueba", qty: "1", total: 5000 }],
      subtotal: 4202,
      tax: 798,
      total: 5000,
      payments: [{ method: "cash", amount: 5000 }],
      printedAt: new Date().toLocaleString("es-CO"),
    });

    const net = await import("net");
    await new Promise<void>((resolve, reject) => {
      const s = net.createConnection(9100, ip, () => {
        s.write(buf, () => { s.end(); resolve(); });
      });
      s.on("error", reject);
    });

    return { ok: true, message: `Test enviado a ${ip}:9100` };
  }
}
