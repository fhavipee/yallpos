import { Controller, Get, Post } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { PILOT_YALL } from "../config/pilot-yall.config";
import { DianCertificateService } from "../fiscal/dian-certificate.service";
import { Roles } from "../auth/decorators/roles.decorator";
import { Public } from "../auth/decorators/public.decorator";
import { MANAGEMENT_ROLES } from "../auth/auth.types";
import { PilotService } from "./pilot.service";

@Controller("v1/pilot")
export class PilotController {
  constructor(
    private cert: DianCertificateService,
    private pilot: PilotService,
  ) {}

  @Public()
  @Get("config")
  getConfig() {
    const certInfo = this.cert.getInfo();
    return {
      ...PILOT_YALL,
      runtime: {
        fiscalEnv: process.env.FISCAL_ENV ?? "simulacion",
        certificateLoaded: certInfo.loaded,
        certificateSubject: certInfo.subject ?? null,
        canSendToDian: certInfo.loaded && !!process.env.FISCAL_TEST_SET_ID,
      },
    };
  }

  @Roles(...MANAGEMENT_ROLES)
  @Get("menu")
  getMenu() {
    return {
      categories: PILOT_YALL.menu.length,
      items: PILOT_YALL.menu.reduce((n, g) => n + g.items.length, 0),
      menu: PILOT_YALL.menu,
    };
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post("sync-menu")
  syncMenu() {
    return this.pilot.syncMenu();
  }

  @Roles(...MANAGEMENT_ROLES)
  @Post("simulate-operational-flow")
  simulateOperationalFlow(@BranchId() branchId: string) {
    return this.pilot.simulateOperationalFlow(branchId);
  }
}
