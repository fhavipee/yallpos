import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TaxKind } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type DefaultTaxSeed = {
  kind: TaxKind;
  code: string;
  name: string;
  rate: number;
  isDefault: boolean;
  sortOrder: number;
};

/** Tarifas Colombia — restaurantes (IVA + impoconsumo). */
export const COLOMBIA_DEFAULT_TAXES: DefaultTaxSeed[] = [
  { kind: TaxKind.iva, code: "iva_19", name: "IVA 19%", rate: 0.19, isDefault: true, sortOrder: 1 },
  { kind: TaxKind.iva, code: "iva_5", name: "IVA 5%", rate: 0.05, isDefault: false, sortOrder: 2 },
  { kind: TaxKind.iva, code: "exento", name: "Exento", rate: 0, isDefault: false, sortOrder: 3 },
  { kind: TaxKind.iva, code: "no_gravado", name: "No gravado", rate: 0, isDefault: false, sortOrder: 4 },
  { kind: TaxKind.consumption, code: "none", name: "Sin impoconsumo", rate: 0, isDefault: true, sortOrder: 1 },
  { kind: TaxKind.consumption, code: "inc_8", name: "Impoconsumo 8%", rate: 0.08, isDefault: false, sortOrder: 2 },
  { kind: TaxKind.consumption, code: "inc_4", name: "Impoconsumo 4%", rate: 0.04, isDefault: false, sortOrder: 3 },
  { kind: TaxKind.consumption, code: "inc_16", name: "Impoconsumo 16%", rate: 0.16, isDefault: false, sortOrder: 4 },
];

export type ResolvedTaxRates = {
  ivaRate: number;
  consumptionRate: number;
  ivaLabel: string;
  consumptionLabel: string;
};

@Injectable()
export class TaxDefinitionService {
  constructor(private prisma: PrismaService) {}

  async listForCompany(companyId: string, activeOnly = false) {
    return this.prisma.taxDefinition.findMany({
      where: { companyId, ...(activeOnly ? { isActive: true } : {}) },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    });
  }

  async getCompanyIdFromBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { companyId: true },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    return branch.companyId;
  }

  async ensureDefaults(companyId: string) {
    const count = await this.prisma.taxDefinition.count({ where: { companyId } });
    if (count > 0) return this.listForCompany(companyId);
    return this.seedDefaults(companyId);
  }

  async seedDefaults(companyId: string) {
    await this.prisma.taxDefinition.createMany({
      data: COLOMBIA_DEFAULT_TAXES.map((t) => ({
        companyId,
        kind: t.kind,
        code: t.code,
        name: t.name,
        rate: t.rate,
        isDefault: t.isDefault,
        sortOrder: t.sortOrder,
        isActive: true,
      })),
      skipDuplicates: true,
    });
    return this.listForCompany(companyId);
  }

  async resolveRates(companyId: string, ivaTaxCode: string, consumptionTaxCode: string): Promise<ResolvedTaxRates> {
    await this.ensureDefaults(companyId);
    const taxes = await this.prisma.taxDefinition.findMany({
      where: { companyId, isActive: true },
    });

    const iva = taxes.find((t) => t.kind === TaxKind.iva && t.code === ivaTaxCode)
      ?? taxes.find((t) => t.kind === TaxKind.iva && t.isDefault);
    const consumption = taxes.find((t) => t.kind === TaxKind.consumption && t.code === consumptionTaxCode)
      ?? taxes.find((t) => t.kind === TaxKind.consumption && t.isDefault);

    return {
      ivaRate: Number(iva?.rate ?? 0.19),
      consumptionRate: Number(consumption?.rate ?? 0),
      ivaLabel: iva?.name ?? ivaTaxCode,
      consumptionLabel: consumption?.name ?? consumptionTaxCode,
    };
  }

  async validateProductTaxCodes(companyId: string, ivaTaxCode: string, consumptionTaxCode: string) {
    await this.ensureDefaults(companyId);
    const taxes = await this.prisma.taxDefinition.findMany({
      where: { companyId, isActive: true },
    });
    const ivaOk = taxes.some((t) => t.kind === TaxKind.iva && t.code === ivaTaxCode);
    const consumptionOk = taxes.some((t) => t.kind === TaxKind.consumption && t.code === consumptionTaxCode);
    if (!ivaOk) throw new BadRequestException(`IVA no válido: ${ivaTaxCode}`);
    if (!consumptionOk) throw new BadRequestException(`Impoconsumo no válido: ${consumptionTaxCode}`);
  }

  buildLabelMap(taxes: { kind: TaxKind; code: string; name: string }[]) {
    const map = new Map<string, string>();
    for (const t of taxes) {
      map.set(`${t.kind}:${t.code}`, t.name);
    }
    return map;
  }

  labelFor(map: Map<string, string>, kind: TaxKind, code: string, fallback: string) {
    return map.get(`${kind}:${code}`) ?? fallback;
  }

  async countProductUsage(companyId: string, code: string, kind: TaxKind) {
    const branches = await this.prisma.branch.findMany({ where: { companyId }, select: { id: true } });
    const branchIds = branches.map((b) => b.id);
    if (branchIds.length === 0) return 0;

    if (kind === TaxKind.iva) {
      return this.prisma.product.count({
        where: { branchId: { in: branchIds }, ivaTaxCode: code, isActive: true },
      });
    }
    return this.prisma.product.count({
      where: { branchId: { in: branchIds }, consumptionTaxCode: code, isActive: true },
    });
  }

  async clearDefaultForKind(companyId: string, kind: TaxKind, exceptId?: string) {
    await this.prisma.taxDefinition.updateMany({
      where: { companyId, kind, ...(exceptId ? { id: { not: exceptId } } : {}) },
      data: { isDefault: false },
    });
  }
}
