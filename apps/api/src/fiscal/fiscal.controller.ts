import { Controller, Get, Param, Post, Query } from "@nestjs/common";
import { FiscalService } from "./fiscal.service";
import { PrismaService } from "../prisma/prisma.service";
import { DianCertificateService } from "./dian-certificate.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { MANAGEMENT_ROLES } from "../auth/auth.types";

@Controller("v1/fiscal")
@Roles(...MANAGEMENT_ROLES)
export class FiscalController {
  constructor(
    private fiscal: FiscalService,
    private prisma: PrismaService,
    private certService: DianCertificateService,
  ) {}

  private async getCompanyId(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error("Sucursal inválida");
    return branch.companyId;
  }

  @Get("config")
  getConfig() {
    return this.fiscal.getCertificateInfo();
  }

  @Post("certificate/reload")
  reloadCertificate() {
    return this.certService.loadCertificate();
  }

  @Get("habilitation/checklist")
  async getChecklist(@Query("branchId") branchId: string) {
    const companyId = await this.getCompanyId(branchId);
    return this.fiscal.getHabilitationChecklist(companyId);
  }

  @Post("habilitation/test-set")
  async submitTestSet(@Query("branchId") branchId: string) {
    const companyId = await this.getCompanyId(branchId);
    return this.fiscal.submitHabilitationTest(companyId);
  }

  @Get("habilitation/status/:zipKey")
  checkZip(@Param("zipKey") zipKey: string) {
    return this.fiscal.checkZipStatus(zipKey);
  }

  @Post("invoices/:invoiceId/emit-pos")
  async emitPos(@Param("invoiceId") invoiceId: string, @Query("branchId") branchId: string) {
    const companyId = await this.getCompanyId(branchId);
    return this.fiscal.issuePosEquivalent(companyId, invoiceId);
  }

  @Post("retry-pending")
  async retryPending(@Query("branchId") branchId: string) {
    const companyId = await this.getCompanyId(branchId);
    return this.fiscal.retryPendingDocuments(companyId);
  }

  @Get("documents/:id")
  async getDocument(@Param("id") id: string, @Query("branchId") branchId: string) {
    const companyId = await this.getCompanyId(branchId);
    return this.fiscal.getDocumentStatus(companyId, id);
  }
}
