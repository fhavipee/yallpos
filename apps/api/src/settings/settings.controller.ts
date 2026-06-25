import { Body, Controller, Get, Patch } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { SettingsService } from "./settings.service";
import { UpdateCompanyDto, UpdateBranchSettingsDto, UpdateFiscalResolutionDto } from "./dto/settings.dto";
import { PrismaService } from "../prisma/prisma.service";

@Controller("v1/settings")
export class SettingsController {
  constructor(private settings: SettingsService, private prisma: PrismaService) {}

  @Roles(...MANAGEMENT_ROLES)
  @Get("company")
  getCompany(@BranchId() branchId: string) {
    return this.settings.getCompanyByBranch(branchId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("company")
  async updateCompany(@BranchId() branchId: string, @Body() dto: UpdateCompanyDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error("Sucursal inválida");
    return this.settings.updateCompany(branch.companyId, dto);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("fiscal-resolution")
  async updateFiscal(@BranchId() branchId: string, @Body() dto: UpdateFiscalResolutionDto) {
    const branch = await this.prisma.branch.findUnique({ where: { id: branchId } });
    if (!branch) throw new Error("Sucursal inválida");
    return this.settings.updateFiscalResolution(branch.companyId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get("branch")
  getBranchSettings(@BranchId() branchId: string) {
    return this.settings.getBranchSettings(branchId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("branch")
  updateBranchSettings(@BranchId() branchId: string, @Body() dto: UpdateBranchSettingsDto) {
    return this.settings.updateBranchSettings(branchId, dto);
  }
}
