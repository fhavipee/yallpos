import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { DianXmlBuilder } from "./dian-xml.builder";
import { DianClient } from "./dian.client";
import { DianXmlSigner } from "./dian-xml.signer";
import { DianCertificateService } from "./dian-certificate.service";
import { buildHabilitationChecklist, HabilitationChecklist } from "./habilitation-checklist";
import { CustomersService } from "../customers/customers.service";
import * as fs from "fs";

@Injectable()
export class FiscalService {
  private readonly logger = new Logger(FiscalService.name);

  constructor(
    private prisma: PrismaService,
    private xmlBuilder: DianXmlBuilder,
    private dianClient: DianClient,
    private xmlSigner: DianXmlSigner,
    private certService: DianCertificateService,
    private customers: CustomersService,
  ) {}

  getCertificateInfo() {
    return {
      ...this.certService.getInfo(),
      fiscalEnv: process.env.FISCAL_ENV ?? "simulacion",
      endpoint: this.dianClient.getEndpoint(),
      testSetId: process.env.FISCAL_TEST_SET_ID ?? null,
      softwareId: process.env.FISCAL_SOFTWARE_ID ?? null,
    };
  }

  async getHabilitationChecklist(companyId: string): Promise<HabilitationChecklist> {
    const cert = this.certService.getInfo();
    const certPath = process.env.FISCAL_CERT_PATH;
    const certFileExists = !!(certPath && fs.existsSync(certPath));

    let certValid = false;
    let certExpiresInDays: number | undefined;
    if (cert.loaded && cert.validTo) {
      const expires = new Date(cert.validTo);
      certExpiresInDays = Math.ceil((expires.getTime() - Date.now()) / 86400000);
      certValid = expires.getTime() > Date.now();
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    const resolution = await this.prisma.fiscalResolution.findFirst({
      where: { companyId, docType: "pos_equivalent", isActive: true },
    });

    return buildHabilitationChecklist({
      certLoaded: cert.loaded,
      certValid,
      certExpiresInDays,
      fiscalEnv: process.env.FISCAL_ENV ?? "simulacion",
      testSetId: process.env.FISCAL_TEST_SET_ID ?? null,
      softwareId: process.env.FISCAL_SOFTWARE_ID ?? null,
      softwarePin: process.env.FISCAL_SOFTWARE_PIN ?? null,
      hasResolution: !!resolution,
      technicalKeyOk: !!(resolution?.technicalKey && !resolution.technicalKey.includes("pendiente")),
      nitOk: !!(company?.nit && company.nit.length >= 8),
      certPathConfigured: !!certPath,
      certFileExists,
    });
  }

  async issuePosEquivalent(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, companyId },
      include: { lines: true, fiscalDocuments: true, customer: true },
    });
    if (!invoice) throw new BadRequestException("Venta no encontrada");
    if (invoice.status !== "paid") throw new BadRequestException("La venta debe estar pagada");

    const existing = invoice.fiscalDocuments.find(
      (d) => d.docType === "pos_equivalent" && d.status === "accepted",
    );
    if (existing) return existing;

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.nit) throw new BadRequestException("Empresa sin NIT configurado");

    const resolution = await this.getActiveResolution(companyId, "pos_equivalent");
    const nextNumber = resolution.currentNumber + 1;
    if (nextNumber > resolution.toNumber) throw new BadRequestException("Resolución DIAN agotada");

    const now = new Date();
    const docNumber = String(nextNumber).padStart(8, "0");
    const fullNumber = `${resolution.prefix}${docNumber}`;
    const fileName = `${fullNumber}.xml`;

    const subtotal = Number(invoice.subtotal);
    const tax = Number(invoice.tax) + Number(invoice.consumptionTax);
    const total = Number(invoice.total);

    const buyer = this.customers.resolveBuyerForFiscal({
      company: {
        defaultBuyerDocType: company.defaultBuyerDocType,
        defaultBuyerDocNumber: company.defaultBuyerDocNumber,
        defaultBuyerName: company.defaultBuyerName,
        defaultBuyerDv: company.defaultBuyerDv,
      },
      customer: invoice.customer,
      requiresNamedBuyer: invoice.requiresNamedBuyer,
    });

    const { xml, cude } = this.xmlBuilder.buildPosEquivalent({
      nit: company.nit,
      prefix: resolution.prefix,
      docNumber,
      issueDate: now.toISOString().slice(0, 10),
      issueTime: now.toTimeString().slice(0, 8),
      subtotal,
      tax,
      total,
      customerDoc: buyer.docNumber,
      customerName: buyer.name,
      customerDocTypeCode: buyer.docTypeCode,
      customerEmail: buyer.email ?? undefined,
      customerAddress: buyer.address ?? undefined,
      customerCity: buyer.city ?? undefined,
      softwareId: process.env.FISCAL_SOFTWARE_ID ?? "YALLPOS",
      pin: process.env.FISCAL_SOFTWARE_PIN ?? "000000",
    });

    const { signedXml } = this.certService.isLoaded()
      ? this.xmlSigner.signXml(xml)
      : { signedXml: xml };

    let status: "accepted" | "contingency" | "rejected" = "accepted";
    let dianResponse: Record<string, unknown> = {};
    let lastError: string | null = null;

    try {
      const result = await this.dianClient.sendDocument(signedXml, "pos_equivalent", fileName);
      dianResponse = result;
      if (!result.success) {
        status = "contingency";
        lastError = result.message;
      }
    } catch (err: any) {
      this.logger.warn(`DIAN no disponible, contingencia: ${err.message}`);
      status = "contingency";
      lastError = err.message;
    }

    return this.persistDocument({
      companyId,
      invoiceId,
      resolutionId: resolution.id,
      nextNumber,
      fullNumber,
      prefix: resolution.prefix,
      docNumber,
      cude,
      signedXml,
      subtotal,
      tax,
      total,
      status,
      dianResponse,
      lastError,
      customerDoc: buyer.docNumber,
      customerName: buyer.name,
    });
  }

  /** Envía documento de prueba al set de habilitación DIAN */
  async submitHabilitationTest(companyId: string) {
    if (!this.certService.isLoaded()) {
      throw new BadRequestException("Cargue certificado .p12 en FISCAL_CERT_PATH");
    }
    if (!process.env.FISCAL_TEST_SET_ID) {
      throw new BadRequestException("Configure FISCAL_TEST_SET_ID");
    }

    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company?.nit) throw new BadRequestException("Empresa sin NIT");

    const { xml, cude } = this.xmlBuilder.buildPosEquivalent({
      nit: company.nit,
      prefix: "SETT",
      docNumber: String(Date.now()).slice(-8),
      issueDate: new Date().toISOString().slice(0, 10),
      issueTime: new Date().toTimeString().slice(0, 8),
      subtotal: 10000,
      tax: 1900,
      total: 11900,
      softwareId: process.env.FISCAL_SOFTWARE_ID ?? "YALLPOS",
      pin: process.env.FISCAL_SOFTWARE_PIN ?? "000000",
    });

    const { signedXml } = this.xmlSigner.signXml(xml);
    const fileName = `SETT-${Date.now()}.xml`;
    const result = await this.dianClient.sendTestSetAsync(signedXml, fileName);

    return { cude, ...result };
  }

  async retryPendingDocuments(companyId: string) {
    const pending = await this.prisma.electronicDocument.findMany({
      where: {
        companyId,
        status: { in: ["pending", "contingency", "rejected"] },
        retryCount: { lt: 5 },
      },
      take: 20,
    });

    const results = [];
    for (const doc of pending) {
      if (!doc.xmlContent) continue;
      try {
        const result = await this.dianClient.sendDocument(
          doc.xmlContent,
          doc.docType,
          `${doc.fullNumber}.xml`,
        );
        const updated = await this.prisma.electronicDocument.update({
          where: { id: doc.id },
          data: {
            status: result.success ? "accepted" : "rejected",
            retryCount: doc.retryCount + 1,
            dianResponse: result as any,
            acceptedAt: result.success ? new Date() : null,
            lastError: result.success ? null : result.message,
          },
        });
        results.push(updated);
      } catch (err: any) {
        await this.prisma.electronicDocument.update({
          where: { id: doc.id },
          data: { retryCount: doc.retryCount + 1, lastError: err.message },
        });
      }
    }
    return results;
  }

  async getDocumentStatus(companyId: string, documentId: string) {
    return this.prisma.electronicDocument.findFirst({
      where: { id: documentId, companyId },
      include: { contingencyLogs: true },
    });
  }

  async checkZipStatus(zipKey: string) {
    return this.dianClient.getStatusZip(zipKey);
  }

  private async persistDocument(params: {
    companyId: string;
    invoiceId: string;
    resolutionId: string;
    nextNumber: number;
    fullNumber: string;
    prefix: string;
    docNumber: string;
    cude: string;
    signedXml: string;
    subtotal: number;
    tax: number;
    total: number;
    status: "accepted" | "contingency" | "rejected";
    dianResponse: Record<string, unknown>;
    lastError: string | null;
    customerDoc?: string;
    customerName?: string;
  }) {
    return this.prisma.$transaction(async (tx) => {
      await tx.fiscalResolution.update({
        where: { id: params.resolutionId },
        data: { currentNumber: params.nextNumber },
      });

      const created = await tx.electronicDocument.create({
        data: {
          companyId: params.companyId,
          invoiceId: params.invoiceId,
          resolutionId: params.resolutionId,
          docType: "pos_equivalent",
          docNumber: params.docNumber,
          prefix: params.prefix,
          fullNumber: params.fullNumber,
          cude: params.cude,
          status: params.status,
          xmlContent: params.signedXml,
          subtotal: params.subtotal,
          tax: params.tax,
          total: params.total,
          customerDoc: params.customerDoc ?? null,
          customerName: params.customerName ?? null,
          dianResponse: params.dianResponse as any,
          lastError: params.lastError,
          acceptedAt: params.status === "accepted" ? new Date() : null,
        },
      });

      if (params.status === "contingency") {
        await tx.fiscalContingencyLog.create({
          data: { documentId: created.id, reason: params.lastError ?? "DIAN no disponible" },
        });
      }

      await tx.salesInvoice.update({
        where: { id: params.invoiceId },
        data: { invoiceNumber: params.fullNumber },
      });

      return created;
    });
  }

  private async getActiveResolution(companyId: string, docType: "pos_equivalent" | "invoice") {
    const resolution = await this.prisma.fiscalResolution.findFirst({
      where: {
        companyId,
        docType,
        isActive: true,
        validFrom: { lte: new Date() },
        validTo: { gte: new Date() },
      },
      orderBy: { createdAt: "desc" },
    });
    if (!resolution) throw new BadRequestException(`Sin resolución activa para ${docType}`);
    return resolution;
  }
}
