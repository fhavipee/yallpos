import { Body, Controller, Post } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { FLOOR_ROLES } from "../auth/auth.types";
import { AuthUser } from "../auth/auth.types";
import { KioskService } from "./kiosk.service";
import { VerifyPinDto } from "./dto/verify-pin.dto";

@Controller("v1/kiosk")
export class KioskController {
  constructor(private kiosk: KioskService) {}

  @Roles(...FLOOR_ROLES)
  @Post("verify-pin")
  verifyPin(
    @BranchId() branchId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: VerifyPinDto,
  ) {
    return this.kiosk.verifyPin(branchId, user.tenantId, dto.pin, dto.type);
  }
}
