import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { AuthUser, MANAGEMENT_ROLES } from "../auth/auth.types";
import { StaffShiftsService } from "./staff-shifts.service";
import { BiometricService } from "./biometric.service";
import { ClockShiftDto } from "./dto/clock-shift.dto";
import { CreateStaffScheduleDto } from "./dto/create-staff-schedule.dto";
import { UpdateStaffScheduleDto } from "./dto/update-staff-schedule.dto";

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
  constructor(
    private shifts: StaffShiftsService,
    private biometric: BiometricService,
  ) {}

  // ── Biometría (huella del dispositivo / WebAuthn) ──────────────

  @Get("biometric/credentials")
  @Roles(...SHIFT_ROLES)
  listBiometric(@CurrentUser() user: AuthUser) {
    return this.biometric.listCredentials(user.id);
  }

  @Delete("biometric/credentials/:id")
  @Roles(...SHIFT_ROLES)
  deleteBiometric(@CurrentUser() user: AuthUser, @Param("id") id: string) {
    return this.biometric.deleteCredential(user.id, id);
  }

  @Post("biometric/register-options")
  @Roles(...SHIFT_ROLES)
  biometricRegisterOptions(@CurrentUser() user: AuthUser, @Headers("origin") origin?: string) {
    return this.biometric.registrationOptions(user.id, user.name, origin);
  }

  @Post("biometric/register-verify")
  @Roles(...SHIFT_ROLES)
  biometricRegisterVerify(
    @CurrentUser() user: AuthUser,
    @Body() body: { response: any; deviceName?: string },
    @Headers("origin") origin?: string,
  ) {
    return this.biometric.verifyRegistration(user.id, origin, body.response, body.deviceName);
  }

  @Post("biometric/clock-options")
  @Roles(...SHIFT_ROLES)
  biometricClockOptions(@Headers("origin") origin?: string) {
    return this.biometric.clockOptions(origin);
  }

  @Post("biometric/clock-verify")
  @Roles(...SHIFT_ROLES)
  async biometricClockVerify(
    @BranchId() branchId: string,
    @Body() body: { sessionId: string; response: any },
    @Headers("origin") origin?: string,
  ) {
    const identified = await this.biometric.identifyByAssertion(origin, body.sessionId, body.response);
    return this.shifts.clockToggle(branchId, identified);
  }

  /** Fallback: marcar con PIN de empleado (equipos sin sensor). */
  @Post("clock-pin")
  @Roles(...SHIFT_ROLES)
  async clockWithPin(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Body() body: { pin: string },
  ) {
    const identified = await this.shifts.findUserByPin(user.tenantId, body.pin ?? "");
    return this.shifts.clockToggle(branchId, identified);
  }

  @Get("home")
  @Roles(...SHIFT_ROLES)
  home(@BranchId() branchId: string, @CurrentUser() user: AuthUser) {
    return this.shifts.getMyAttendanceHome(branchId, user.id);
  }

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

  @Get("board")
  @Roles(...MANAGEMENT_ROLES)
  board(@BranchId() branchId: string, @Query("date") date?: string) {
    return this.shifts.getDayBoard(branchId, date);
  }

  @Get("schedule")
  @Roles(...SHIFT_ROLES)
  listSchedule(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("userId") userId?: string,
  ) {
    const isManager = MANAGEMENT_ROLES.includes(user.role);
    return this.shifts.listSchedules(branchId, from, to, isManager ? userId : user.id);
  }

  @Post("schedule")
  @Roles(...MANAGEMENT_ROLES)
  createSchedule(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateStaffScheduleDto,
  ) {
    return this.shifts.createSchedule(branchId, dto, user.id);
  }

  @Patch("schedule/:id")
  @Roles(...MANAGEMENT_ROLES)
  updateSchedule(
    @BranchId() branchId: string,
    @Param("id") id: string,
    @Body() dto: UpdateStaffScheduleDto,
  ) {
    return this.shifts.updateSchedule(branchId, id, dto);
  }

  @Delete("schedule/:id")
  @Roles(...MANAGEMENT_ROLES)
  deleteSchedule(@BranchId() branchId: string, @Param("id") id: string) {
    return this.shifts.deleteSchedule(branchId, id);
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
