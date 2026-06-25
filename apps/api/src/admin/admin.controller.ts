import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthUser, MANAGEMENT_ROLES } from "../auth/auth.types";
import { AdminService } from "./admin.service";
import {
  AdjustStockDto,
  CreateBranchDto,
  CreateFiscalResolutionDto,
  PaymentMethodsDto,
  ResetPasswordDto,
  UpdateBranchMetaDto,
  UpdateCategoryDto,
  UpdateCompanyAdminDto,
  UpdateFiscalResolutionAdminDto,
  UpsertAreaDto,
  UpsertCashRegisterDto,
  UpsertKdsRoutingDto,
  UpsertKdsStationDto,
  UpsertModifierGroupDto,
  UpsertModifierOptionDto,
  UpsertStaffDto,
  UpsertTableDto,
  UpsertTenantRoleDto,
  UpsertUserDto,
  UpsertWarehouseDto,
} from "./dto/admin.dto";

@Controller("v1/admin")
@Roles(...MANAGEMENT_ROLES)
export class AdminController {
  constructor(private admin: AdminService) {}

  @Get("setup")
  getSetup(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.getSetupStatus(branchId, user);
  }

  @Get("branch")
  getBranch(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.getBranchMeta(branchId, user);
  }

  @Patch("branch")
  updateBranch(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateBranchMetaDto) {
    return this.admin.updateBranchMeta(branchId, user, dto);
  }

  @Post("branches")
  createBranch(@CurrentUser() user: AuthUser, @Body() dto: CreateBranchDto) {
    return this.admin.createBranch(user, dto);
  }

  @Patch("company")
  updateCompany(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpdateCompanyAdminDto) {
    return this.admin.updateCompany(branchId, user, dto);
  }

  @Get("fiscal-resolutions")
  listFiscal(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listFiscalResolutions(branchId, user);
  }

  @Post("fiscal-resolutions")
  createFiscal(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: CreateFiscalResolutionDto) {
    return this.admin.createFiscalResolution(branchId, user, dto);
  }

  @Patch("fiscal-resolutions/:id")
  updateFiscal(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateFiscalResolutionAdminDto,
  ) {
    return this.admin.updateFiscalResolution(branchId, user, id, dto);
  }

  @Post("fiscal/certificate")
  @UseInterceptors(FileInterceptor("file"))
  uploadCertificate(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string },
    @Body("password") password?: string,
  ) {
    if (!file) throw new BadRequestException("Archivo .p12 requerido");
    return this.admin.uploadCertificate(branchId, user, file, password);
  }

  @Get("payment-methods")
  getPaymentMethods(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.getPaymentMethods(branchId, user);
  }

  @Patch("payment-methods")
  updatePaymentMethods(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: PaymentMethodsDto) {
    return this.admin.updatePaymentMethods(branchId, user, dto);
  }

  @Get("categories")
  listCategories(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listCategories(branchId, user);
  }

  @Patch("categories/:id")
  updateCategory(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.admin.updateCategory(branchId, user, id, dto);
  }

  @Delete("categories/:id")
  deleteCategory(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteCategory(branchId, user, id);
  }

  @Get("areas")
  listAreas(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listAreas(branchId, user);
  }

  @Post("areas")
  createArea(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertAreaDto) {
    return this.admin.createArea(branchId, user, dto);
  }

  @Patch("areas/:id")
  updateArea(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertAreaDto,
  ) {
    return this.admin.updateArea(branchId, user, id, dto);
  }

  @Delete("areas/:id")
  deleteArea(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteArea(branchId, user, id);
  }

  @Get("tables")
  listTables(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listTablesAdmin(branchId, user);
  }

  @Post("tables")
  createTable(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertTableDto) {
    return this.admin.createTable(branchId, user, dto);
  }

  @Patch("tables/:id")
  updateTable(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertTableDto,
  ) {
    return this.admin.updateTable(branchId, user, id, dto);
  }

  @Delete("tables/:id")
  deleteTable(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteTable(branchId, user, id);
  }

  @Get("staff")
  listStaff(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listStaff(branchId, user);
  }

  @Post("staff")
  createStaff(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertStaffDto) {
    return this.admin.createStaff(branchId, user, dto);
  }

  @Patch("staff/:id")
  updateStaff(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertStaffDto,
  ) {
    return this.admin.updateStaff(branchId, user, id, dto);
  }

  @Delete("staff/:id")
  deleteStaff(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteStaff(branchId, user, id);
  }

  @Get("permissions")
  listPermissions() {
    return this.admin.listPermissions();
  }

  @Get("roles")
  listRoles(@CurrentUser() user: AuthUser) {
    return this.admin.listRoles(user);
  }

  @Post("roles")
  createRole(@CurrentUser() user: AuthUser, @Body() dto: UpsertTenantRoleDto) {
    return this.admin.createRole(user, dto);
  }

  @Patch("roles/:id")
  updateRole(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertTenantRoleDto) {
    return this.admin.updateRole(user, id, dto);
  }

  @Delete("roles/:id")
  deleteRole(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteRole(user, id);
  }

  @Get("users")
  listUsers(@CurrentUser() user: AuthUser) {
    return this.admin.listUsers(user);
  }

  @Post("users")
  createUser(@CurrentUser() user: AuthUser, @Body() dto: UpsertUserDto) {
    return this.admin.createUser(user, dto);
  }

  @Patch("users/:id")
  updateUser(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: UpsertUserDto) {
    return this.admin.updateUser(user, id, dto);
  }

  @Post("users/:id/reset-password")
  resetPassword(@CurrentUser() user: AuthUser, @Param("id") id: string, @Body() dto: ResetPasswordDto) {
    return this.admin.resetUserPassword(user, id, dto);
  }

  @Delete("users/:id")
  deleteUser(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteUser(user, id);
  }

  @Get("kds/stations")
  listKdsStations(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listKdsStations(branchId, user);
  }

  @Post("kds/stations")
  createKdsStation(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertKdsStationDto) {
    return this.admin.createKdsStation(branchId, user, dto);
  }

  @Patch("kds/stations/:id")
  updateKdsStation(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertKdsStationDto,
  ) {
    return this.admin.updateKdsStation(branchId, user, id, dto);
  }

  @Delete("kds/stations/:id")
  deleteKdsStation(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteKdsStation(branchId, user, id);
  }

  @Get("kds/routing-rules")
  listKdsRouting(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listKdsRouting(branchId, user);
  }

  @Post("kds/routing-rules")
  createKdsRouting(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertKdsRoutingDto) {
    return this.admin.createKdsRouting(branchId, user, dto);
  }

  @Delete("kds/routing-rules/:id")
  deleteKdsRouting(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteKdsRouting(branchId, user, id);
  }

  @Get("cash-registers")
  listCashRegisters(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listCashRegisters(branchId, user);
  }

  @Post("cash-registers")
  createCashRegister(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertCashRegisterDto) {
    return this.admin.createCashRegister(branchId, user, dto);
  }

  @Patch("cash-registers/:id")
  updateCashRegister(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertCashRegisterDto,
  ) {
    return this.admin.updateCashRegister(branchId, user, id, dto);
  }

  @Delete("cash-registers/:id")
  deleteCashRegister(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteCashRegister(branchId, user, id);
  }

  @Get("warehouses")
  listWarehouses(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listWarehouses(branchId, user);
  }

  @Post("warehouses")
  createWarehouse(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertWarehouseDto) {
    return this.admin.createWarehouse(branchId, user, dto);
  }

  @Patch("warehouses/:id")
  updateWarehouse(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertWarehouseDto,
  ) {
    return this.admin.updateWarehouse(branchId, user, id, dto);
  }

  @Delete("warehouses/:id")
  deleteWarehouse(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteWarehouse(branchId, user, id);
  }

  @Get("stock")
  listStock(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Query("warehouseId") warehouseId?: string) {
    return this.admin.listStock(branchId, user, warehouseId);
  }

  @Patch("stock")
  adjustStock(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: AdjustStockDto) {
    return this.admin.adjustStock(branchId, user, dto);
  }

  @Get("modifier-groups")
  listModifierGroups(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.listModifierGroups(branchId, user);
  }

  @Post("modifier-groups")
  createModifierGroup(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: UpsertModifierGroupDto) {
    return this.admin.createModifierGroup(branchId, user, dto);
  }

  @Patch("modifier-groups/:id")
  updateModifierGroup(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertModifierGroupDto,
  ) {
    return this.admin.updateModifierGroup(branchId, user, id, dto);
  }

  @Delete("modifier-groups/:id")
  deleteModifierGroup(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteModifierGroup(branchId, user, id);
  }

  @Post("modifier-groups/:groupId/options")
  createModifierOption(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("groupId") groupId: string,
    @Body() dto: UpsertModifierOptionDto,
  ) {
    return this.admin.createModifierOption(branchId, user, groupId, dto);
  }

  @Patch("modifier-options/:id")
  updateModifierOption(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Param("id") id: string,
    @Body() dto: UpsertModifierOptionDto,
  ) {
    return this.admin.updateModifierOption(branchId, user, id, dto);
  }

  @Delete("modifier-options/:id")
  deleteModifierOption(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.admin.deleteModifierOption(branchId, user, id);
  }

  @Get("audit-log")
  auditLog(@CurrentUser() user: AuthUser, @Query("limit") limit?: string) {
    return this.admin.getAuditLog(user, limit ? Number(limit) : 50);
  }

  @Post("setup/apply-defaults")
  applyDefaults(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.applySetupDefaults(branchId, user);
  }

  @Get("onboarding/state")
  onboardingState(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.admin.getOnboardingState(branchId, user);
  }

  @Post("onboarding/reapply-catalog")
  reapplyCatalog(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Body("template") template?: "restaurant" | "bakery" | "cafe",
  ) {
    return this.admin.reapplyCatalog(branchId, user, template ?? "restaurant");
  }
}
