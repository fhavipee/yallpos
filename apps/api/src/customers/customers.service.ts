import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { AttachCustomerDto, UpdateGenericBuyerDto, UpsertCustomerDto } from "./dto/customer.dto";

/** Códigos DIAN tipo de documento del adquiriente (Anexo Técnico) */
export const DIAN_DOC_TYPE_CODES: Record<string, string> = {
  RC: "11",
  TI: "12",
  CC: "13",
  CE: "22",
  NIT: "31",
  PA: "41",
  DIE: "42",
};

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async resolveCompanyId(branchId: string) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    return branch.companyId;
  }

  async list(branchId: string, search?: string, take = 50) {
    const companyId = await this.resolveCompanyId(branchId);
    const q = search?.trim();
    return this.prisma.customer.findMany({
      where: {
        companyId,
        isActive: true,
        isGeneric: false,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { docNumber: { contains: q } },
                { phone: { contains: q } },
                { email: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: "asc" }],
      take: Math.min(take, 100),
    });
  }

  async getById(branchId: string, id: string) {
    const companyId = await this.resolveCompanyId(branchId);
    const customer = await this.prisma.customer.findFirst({ where: { id, companyId } });
    if (!customer) throw new NotFoundException("Cliente no encontrado");
    return customer;
  }

  async getGenericBuyer(branchId: string) {
    const companyId = await this.resolveCompanyId(branchId);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    let generic = await this.prisma.customer.findFirst({
      where: { companyId, isGeneric: true },
    });
    if (!generic) {
      generic = await this.prisma.customer.create({
        data: {
          companyId,
          isGeneric: true,
          docType: company.defaultBuyerDocType,
          docNumber: company.defaultBuyerDocNumber,
          dv: company.defaultBuyerDv,
          name: company.defaultBuyerName,
          country: company.country || "CO",
          fiscalResponsibilities: "R-99-PN",
        },
      });
    }
    return {
      customer: generic,
      companyDefaults: {
        defaultBuyerDocType: company.defaultBuyerDocType,
        defaultBuyerDocNumber: company.defaultBuyerDocNumber,
        defaultBuyerName: company.defaultBuyerName,
        defaultBuyerDv: company.defaultBuyerDv,
      },
    };
  }

  async updateGenericBuyer(branchId: string, dto: UpdateGenericBuyerDto) {
    const companyId = await this.resolveCompanyId(branchId);
    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        ...(dto.defaultBuyerDocType !== undefined
          ? { defaultBuyerDocType: dto.defaultBuyerDocType }
          : {}),
        ...(dto.defaultBuyerDocNumber !== undefined
          ? { defaultBuyerDocNumber: dto.defaultBuyerDocNumber.trim() }
          : {}),
        ...(dto.defaultBuyerName !== undefined
          ? { defaultBuyerName: dto.defaultBuyerName.trim() }
          : {}),
        ...(dto.defaultBuyerDv !== undefined
          ? { defaultBuyerDv: dto.defaultBuyerDv.trim() || null }
          : {}),
      },
    });

    const existing = await this.prisma.customer.findFirst({
      where: { companyId, isGeneric: true },
    });
    const genericData = {
      docType: company.defaultBuyerDocType,
      docNumber: company.defaultBuyerDocNumber,
      dv: company.defaultBuyerDv,
      name: company.defaultBuyerName,
    };
    const customer = existing
      ? await this.prisma.customer.update({ where: { id: existing.id }, data: genericData })
      : await this.prisma.customer.create({
          data: {
            companyId,
            isGeneric: true,
            ...genericData,
            fiscalResponsibilities: "R-99-PN",
            country: company.country || "CO",
          },
        });

    return { company, customer };
  }

  validateNamedBuyer(dto: UpsertCustomerDto) {
    const doc = dto.docNumber?.replace(/\D/g, "") ?? "";
    if (!doc) throw new BadRequestException("Número de documento obligatorio para factura con datos");
    if (!dto.name?.trim()) throw new BadRequestException("Nombre o razón social obligatorio");
    if (dto.docType === "NIT" && doc.length < 5) {
      throw new BadRequestException("NIT inválido");
    }
    if (dto.docType === "CC" && (doc.length < 5 || doc.length > 12)) {
      throw new BadRequestException("Cédula inválida");
    }
    // Factura electrónica: email recomendado / requerido para envío
    if (!dto.email?.trim()) {
      throw new BadRequestException("Email obligatorio para factura electrónica");
    }
    if (!dto.address?.trim() || !dto.city?.trim()) {
      throw new BadRequestException("Dirección y ciudad obligatorias para factura electrónica");
    }
  }

  private normalizeDoc(doc?: string | null) {
    return doc?.replace(/\D/g, "") || null;
  }

  async create(branchId: string, dto: UpsertCustomerDto, opts?: { forFiscal?: boolean }) {
    const companyId = await this.resolveCompanyId(branchId);
    if (opts?.forFiscal) this.validateNamedBuyer(dto);

    const docNumber = this.normalizeDoc(dto.docNumber);
    if (docNumber) {
      const dup = await this.prisma.customer.findFirst({
        where: { companyId, docType: dto.docType, docNumber, isGeneric: false },
      });
      if (dup) throw new BadRequestException("Ya existe un cliente con ese documento");
    }

    return this.prisma.customer.create({
      data: {
        companyId,
        docType: dto.docType,
        docNumber,
        dv: dto.dv?.trim() || null,
        name: dto.name.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        department: dto.department?.trim() || null,
        country: dto.country?.trim() || "CO",
        taxRegime: dto.taxRegime?.trim() || null,
        fiscalResponsibilities: dto.fiscalResponsibilities?.trim() || "R-99-PN",
        loyaltyEnabled: dto.loyaltyEnabled ?? false,
        loyaltyTier: dto.loyaltyTier?.trim() || null,
        discountPercent: dto.discountPercent ?? 0,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async update(branchId: string, id: string, dto: Partial<UpsertCustomerDto>) {
    const existing = await this.getById(branchId, id);
    if (existing.isGeneric) {
      throw new BadRequestException("Edite el consumidor genérico desde Empresa / Cliente genérico");
    }

    const docNumber =
      dto.docNumber !== undefined ? this.normalizeDoc(dto.docNumber) : existing.docNumber;
    const docType = dto.docType ?? existing.docType;

    if (docNumber && (docNumber !== existing.docNumber || docType !== existing.docType)) {
      const dup = await this.prisma.customer.findFirst({
        where: {
          companyId: existing.companyId,
          docType,
          docNumber,
          isGeneric: false,
          id: { not: id },
        },
      });
      if (dup) throw new BadRequestException("Ya existe un cliente con ese documento");
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.docType !== undefined ? { docType: dto.docType } : {}),
        ...(dto.docNumber !== undefined ? { docNumber } : {}),
        ...(dto.dv !== undefined ? { dv: dto.dv.trim() || null } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim().toLowerCase() || null } : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.address !== undefined ? { address: dto.address.trim() || null } : {}),
        ...(dto.city !== undefined ? { city: dto.city.trim() || null } : {}),
        ...(dto.department !== undefined ? { department: dto.department.trim() || null } : {}),
        ...(dto.country !== undefined ? { country: dto.country.trim() || "CO" } : {}),
        ...(dto.taxRegime !== undefined ? { taxRegime: dto.taxRegime.trim() || null } : {}),
        ...(dto.fiscalResponsibilities !== undefined
          ? { fiscalResponsibilities: dto.fiscalResponsibilities.trim() || null }
          : {}),
        ...(dto.loyaltyEnabled !== undefined ? { loyaltyEnabled: dto.loyaltyEnabled } : {}),
        ...(dto.loyaltyTier !== undefined ? { loyaltyTier: dto.loyaltyTier.trim() || null } : {}),
        ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes.trim() || null } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  async upsertFromPay(companyId: string, dto: UpsertCustomerDto, forFiscal: boolean) {
    if (forFiscal) this.validateNamedBuyer(dto);
    const docNumber = this.normalizeDoc(dto.docNumber);
    if (!docNumber) throw new BadRequestException("Documento obligatorio");

    const existing = await this.prisma.customer.findFirst({
      where: { companyId, docType: dto.docType, docNumber, isGeneric: false },
    });

    const data: Prisma.CustomerUpdateInput = {
      name: dto.name.trim(),
      dv: dto.dv?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      address: dto.address?.trim() || null,
      city: dto.city?.trim() || null,
      department: dto.department?.trim() || null,
      country: dto.country?.trim() || "CO",
      taxRegime: dto.taxRegime?.trim() || null,
      fiscalResponsibilities: dto.fiscalResponsibilities?.trim() || "R-99-PN",
    };

    if (existing) {
      return this.prisma.customer.update({ where: { id: existing.id }, data });
    }
    return this.prisma.customer.create({
      data: {
        companyId,
        docType: dto.docType,
        docNumber,
        name: dto.name.trim(),
        dv: dto.dv?.trim() || null,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        address: dto.address?.trim() || null,
        city: dto.city?.trim() || null,
        department: dto.department?.trim() || null,
        country: dto.country?.trim() || "CO",
        taxRegime: dto.taxRegime?.trim() || null,
        fiscalResponsibilities: dto.fiscalResponsibilities?.trim() || "R-99-PN",
        loyaltyEnabled: dto.loyaltyEnabled ?? false,
        discountPercent: dto.discountPercent ?? 0,
      },
    });
  }

  async attachToInvoice(branchId: string, invoiceId: string, dto: AttachCustomerDto) {
    const companyId = await this.resolveCompanyId(branchId);
    const invoice = await this.prisma.salesInvoice.findFirst({
      where: { id: invoiceId, branchId },
    });
    if (!invoice) throw new NotFoundException("Factura no encontrada");
    if (invoice.status === "paid" || invoice.status === "voided") {
      throw new BadRequestException("No se puede cambiar el cliente de una venta cerrada");
    }

    const requiresNamedBuyer = dto.requiresNamedBuyer ?? Boolean(dto.customerId || dto.customer);
    let customerId: string | null = null;

    if (requiresNamedBuyer) {
      if (dto.customerId) {
        const c = await this.getById(branchId, dto.customerId);
        if (c.isGeneric) throw new BadRequestException("Seleccione un cliente con datos fiscales");
        this.validateNamedBuyer({
          docType: c.docType as any,
          docNumber: c.docNumber ?? undefined,
          name: c.name,
          email: c.email ?? undefined,
          address: c.address ?? undefined,
          city: c.city ?? undefined,
        });
        customerId = c.id;
      } else if (dto.customer) {
        const c = await this.upsertFromPay(companyId, dto.customer, true);
        customerId = c.id;
      } else {
        throw new BadRequestException("Indique el cliente para factura con datos");
      }
    } else {
      const { customer } = await this.getGenericBuyer(branchId);
      customerId = customer.id;
    }

    await this.prisma.salesInvoice.update({
      where: { id: invoiceId },
      data: { customerId, requiresNamedBuyer },
    });

    if (dto.applyLoyaltyDiscount && customerId) {
      const customer = await this.prisma.customer.findUniqueOrThrow({ where: { id: customerId } });
      const pct = Number(customer.discountPercent);
      if (pct > 0 && !customer.isGeneric) {
        // Delegado a PosService vía callback — aquí solo marcamos; pos.applyCustomerDiscount
        return {
          invoiceId,
          customerId,
          requiresNamedBuyer,
          suggestedDiscountPercent: pct,
          customer,
        };
      }
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId! } });
    return { invoiceId, customerId, requiresNamedBuyer, customer, suggestedDiscountPercent: 0 };
  }

  async addLoyaltyPoints(customerId: string, invoiceTotal: number) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer || customer.isGeneric || !customer.loyaltyEnabled) return null;
    const earned = Math.floor(Number(invoiceTotal) / 1000); // 1 punto por cada $1.000
    if (earned <= 0) return customer;
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { loyaltyPoints: { increment: earned } },
    });
  }

  resolveBuyerForFiscal(params: {
    company: {
      defaultBuyerDocType: string;
      defaultBuyerDocNumber: string;
      defaultBuyerName: string;
      defaultBuyerDv: string | null;
    };
    customer: {
      isGeneric: boolean;
      docType: string;
      docNumber: string | null;
      dv: string | null;
      name: string;
      email: string | null;
      phone: string | null;
      address: string | null;
      city: string | null;
      department: string | null;
      country: string;
      fiscalResponsibilities: string | null;
    } | null;
    requiresNamedBuyer: boolean;
  }) {
    const { company, customer, requiresNamedBuyer } = params;
    if (requiresNamedBuyer && customer && !customer.isGeneric) {
      return {
        docType: customer.docType,
        docTypeCode: DIAN_DOC_TYPE_CODES[customer.docType] ?? "13",
        docNumber: customer.docNumber ?? company.defaultBuyerDocNumber,
        dv: customer.dv,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        city: customer.city,
        department: customer.department,
        country: customer.country || "CO",
        fiscalResponsibilities: customer.fiscalResponsibilities || "R-99-PN",
        isGeneric: false,
      };
    }
    return {
      docType: company.defaultBuyerDocType,
      docTypeCode: DIAN_DOC_TYPE_CODES[company.defaultBuyerDocType] ?? "13",
      docNumber: company.defaultBuyerDocNumber,
      dv: company.defaultBuyerDv,
      name: company.defaultBuyerName,
      email: null as string | null,
      phone: null as string | null,
      address: null as string | null,
      city: null as string | null,
      department: null as string | null,
      country: "CO",
      fiscalResponsibilities: "R-99-PN",
      isGeneric: true,
    };
  }
}
