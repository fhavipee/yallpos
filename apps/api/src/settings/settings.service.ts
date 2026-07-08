import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UpdateCompanyDto, UpdateBranchSettingsDto, UpdateFiscalResolutionDto } from "./dto/settings.dto";
import { KioskService } from "../kiosk/kiosk.service";
import { BadRequestException } from "@nestjs/common";
import { mergeKioskPinUpdate } from "../common/pin.util";

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService, private kiosk: KioskService) {}

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
    const branchSettings = (branches[branchId] ?? {}) as Record<string, unknown>;
    return this.kiosk.sanitizeBranchSettings(branchSettings);
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

    let kioskPatch: Record<string, unknown> | undefined;
    if (dto.kiosk?.adminPin?.trim() || dto.kiosk?.waiterExitPin?.trim()) {
      try {
        kioskPatch = mergeKioskPinUpdate(
          current.kiosk as Parameters<typeof mergeKioskPinUpdate>[0],
          dto.kiosk,
        ) as Record<string, unknown>;
      } catch {
        throw new BadRequestException("PIN de administrador debe ser de 4 a 6 dígitos numéricos");
      }
    }

    branches[branchId] = {
      ...current,
      ...(dto.printers ? { printers: { ...(current.printers as object ?? {}), ...dto.printers } } : {}),
      ...(dto.notifications ? { notifications: { ...(current.notifications as object ?? {}), ...dto.notifications } } : {}),
      ...(dto.pos ? { pos: { ...(current.pos as object ?? {}), ...dto.pos } } : {}),
      ...(kioskPatch ? { kiosk: kioskPatch } : {}),
    };

    const nextSettings = { ...settings, branches };

    await this.prisma.tenant.update({
      where: { id: branch.company.tenantId },
      data: { settings: nextSettings as object },
    });

    return branches[branchId] as Record<string, unknown>;
  }
}
