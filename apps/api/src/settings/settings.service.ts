import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateCompanyDto, UpdateBranchSettingsDto, UpdateFiscalResolutionDto } from "./dto/settings.dto";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getCompanyByBranch(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: {
        company: { include: { fiscalResolutions: { where: { isActive: true } } } },
      },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");
    return branch.company;
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    return this.prisma.company.update({
      where: { id: companyId },
      data: dto,
    });
  }

  async updateFiscalResolution(companyId: string, dto: UpdateFiscalResolutionDto) {
    const resolution = await this.prisma.fiscalResolution.findFirst({
      where: { companyId, docType: "pos_equivalent", isActive: true },
    });
    if (!resolution) throw new NotFoundException("Resolución no encontrada");

    return this.prisma.fiscalResolution.update({
      where: { id: resolution.id },
      data: {
        prefix: dto.prefix ?? resolution.prefix,
        fromNumber: dto.fromNumber ?? resolution.fromNumber,
        toNumber: dto.toNumber ?? resolution.toNumber,
        validFrom: dto.validFrom ? new Date(dto.validFrom) : resolution.validFrom,
        validTo: dto.validTo ? new Date(dto.validTo) : resolution.validTo,
        technicalKey: dto.technicalKey ?? resolution.technicalKey,
      },
    });
  }

  async getBranchSettings(branchId: string) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = (settings.branches ?? {}) as Record<string, unknown>;
    return branches[branchId] ?? {};
  }

  async updateBranchSettings(branchId: string, dto: UpdateBranchSettingsDto) {
    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      include: { company: { include: { tenant: true } } },
    });
    if (!branch) throw new NotFoundException("Sucursal no encontrada");

    const settings = (branch.company.tenant.settings ?? {}) as Record<string, unknown>;
    const branches = { ...((settings.branches ?? {}) as Record<string, unknown>) };
    const current = (branches[branchId] ?? {}) as Record<string, unknown>;

    branches[branchId] = {
      ...current,
      ...(dto.printers ? { printers: { ...(current.printers as object ?? {}), ...dto.printers } } : {}),
      ...(dto.notifications ? { notifications: { ...(current.notifications as object ?? {}), ...dto.notifications } } : {}),
      ...(dto.kiosk ? { kiosk: { ...(current.kiosk as object ?? {}), ...dto.kiosk } } : {}),
    };

    const nextSettings = { ...settings, branches };

    await this.prisma.tenant.update({
      where: { id: branch.company.tenantId },
      data: { settings: nextSettings as object },
    });

    return branches[branchId];
  }
}
