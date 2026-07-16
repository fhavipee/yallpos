import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthUser, MANAGEMENT_ROLES } from "../auth/auth.types";
import { StaffShiftsService } from "./staff-shifts.service";
import { ClockShiftDto } from "./dto/clock-shift.dto";

const SHIFT_ROLES: UserRole[] = [
  UserRole.owner,
  UserRole.manager,
  UserRole.cashier,
  UserRole.waiter,
  UserRole.kitchen,
  UserRole.baker,
];

@Controller("v1/staff-shifts")
export class StaffShiftsController {
  constructor(private shifts: StaffShiftsService) {}

  @Get("current")
  @Roles(...SHIFT_ROLES)
  current(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.shifts.getCurrent(branchId, user.id);
  }

  @Post("clock-in")
  @Roles(...SHIFT_ROLES)
  clockIn(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: ClockShiftDto) {
    return this.shifts.clockIn(branchId, user.id, dto);
  }

  @Post("clock-out")
  @Roles(...SHIFT_ROLES)
  clockOut(@BranchId() branchId: string, @CurrentUser() user: AuthUser, @Body() dto: ClockShiftDto) {
    return this.shifts.clockOut(branchId, user.id, dto);
  }

  @Get()
  @Roles(...MANAGEMENT_ROLES)
  list(
    @BranchId() branchId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userId") userId?: string,
  ) {
    return this.shifts.list(branchId, from, to, userId);
  }

  @Post(":id/force-clock-out")
  @Roles(...MANAGEMENT_ROLES)
  forceClockOut(@BranchId() branchId: string, @Param("id") id: string, @Body() dto: ClockShiftDto) {
    return this.shifts.forceClockOut(branchId, id, dto);
  }
}
