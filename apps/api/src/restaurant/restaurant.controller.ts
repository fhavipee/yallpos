import { Body, Controller, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { AuthUser, FLOOR_ROLES, MANAGEMENT_ROLES } from "../auth/auth.types";
import { OpenTableSessionDto, WaiterAttributionDto } from "./dto/open-table-session.dto";
import { TransferWaiterDto } from "./dto/transfer-waiter.dto";
import { CreateReservationDto } from "./dto/create-reservation.dto";
import { UpdateReservationDto } from "./dto/update-reservation.dto";
import { UpdateDailyMenuDto } from "./dto/update-daily-menu.dto";
import { UpdateWaiterDto } from "./dto/update-waiter.dto";
import { RestaurantService } from "./restaurant.service";

@Controller("v1/restaurant")
export class RestaurantController {
  constructor(private service: RestaurantService) {}

  @Get("companies")
  getCompanies(@CurrentUser() user: AuthUser) {
    return this.service.getCompanies(user.tenantId);
  }

  @Get("branches")
  getBranches(@Query("companyId") companyId: string, @CurrentUser() user: AuthUser) {
    return this.service.getBranches(companyId, user.tenantId);
  }

  @Roles(...FLOOR_ROLES)
  @Get("areas")
  getAreas(@BranchId() branchId: string) { return this.service.getAreas(branchId); }

  @Roles(...FLOOR_ROLES)
  @Get("tables")
  getTables(@BranchId() branchId: string, @Query("areaId") areaId?: string) { return this.service.getTables(branchId, areaId); }

  @Roles(...FLOOR_ROLES)
  @Get("waiters")
  getWaiters(@BranchId() branchId: string) { return this.service.getWaiters(branchId); }

  @Roles(...MANAGEMENT_ROLES)
  @Patch("waiters/:id")
  updateWaiter(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpdateWaiterDto) {
    return this.service.updateWaiter(branchId, id, dto.phone);
  }

  @Roles(...FLOOR_ROLES)
  @Post("table-sessions/open")
  openTableSession(
    @BranchId() branchId: string,
    @Body() dto: OpenTableSessionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.openTableSession(branchId, dto, user.id);
  }

  @Roles(...FLOOR_ROLES)
  @Post("table-sessions/:id/assign-waiter")
  assignWaiter(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body() dto: WaiterAttributionDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.assignSessionWaiter(branchId, id, user.tenantId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Post("table-sessions/:id/transfer-waiter")
  transfer(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: TransferWaiterDto) {
    return this.service.transferWaiter(branchId, id, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Post("table-sessions/:id/close")
  close(@BranchId() branchId: string, @Param("id") id: string) {
    return this.service.closeTableSession(branchId, id);
  }

  @Roles(...FLOOR_ROLES)
  @Get("daily-menu")
  getDailyMenu(@BranchId() branchId: string) {
    return this.service.getDailyMenu(branchId);
  }

  @Roles(...MANAGEMENT_ROLES)
  @Put("daily-menu")
  updateDailyMenu(@BranchId() branchId: string, @Body() dto: UpdateDailyMenuDto) {
    return this.service.updateDailyMenu(branchId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Get("reservations/upcoming")
  getUpcoming(@BranchId() branchId: string, @Query("withinMinutes") withinMinutes?: string) {
    return this.service.getUpcomingReservations(branchId, withinMinutes ? Number(withinMinutes) : 120);
  }

  @Roles(...FLOOR_ROLES)
  @Get("reservations")
  getReservations(@BranchId() branchId: string, @Query("date") date?: string) {
    return this.service.getReservations(branchId, date);
  }

  @Roles(...FLOOR_ROLES)
  @Post("reservations/whatsapp-preview")
  previewReservationWhatsApp(@BranchId() branchId: string, @Body() dto: CreateReservationDto) {
    return this.service.previewReservationWhatsApp(branchId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Post("reservations")
  createReservation(@BranchId() branchId: string, @Body() dto: CreateReservationDto) {
    return this.service.createReservation(branchId, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Patch("reservations/:id")
  updateReservation(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: UpdateReservationDto) {
    return this.service.updateReservation(branchId, id, dto);
  }

  @Roles(...FLOOR_ROLES)
  @Post("reservations/:id/seat")
  seatReservation(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body("waiterId") waiterId: string,
  ) {
    return this.service.seatReservation(branchId, id, waiterId);
  }
}
