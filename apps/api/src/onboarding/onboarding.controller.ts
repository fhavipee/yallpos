import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { BranchId } from "../common/decorators/branch-id.decorator";
import { Roles } from "../auth/decorators/roles.decorator";
import { MANAGEMENT_ROLES } from "../auth/auth.types";
import { OnboardingService } from "./onboarding.service";
import {
  OnboardingBranchDto,
  OnboardingBusinessDto,
  OnboardingCatalogDto,
  OnboardingFiscalDto,
  OnboardingGoLiveDto,
} from "./dto/onboarding.dto";

@Controller("v1/onboarding")
@Roles(...MANAGEMENT_ROLES)
export class OnboardingController {
  constructor(private onboarding: OnboardingService) {}

  @Post("step/business")
  stepBusiness(@Body() dto: OnboardingBusinessDto) {
    return this.onboarding.stepBusiness(dto);
  }

  @Post("step/branch")
  stepBranch(@Body() dto: OnboardingBranchDto) {
    return this.onboarding.stepBranch(dto);
  }

  @Post("step/fiscal")
  stepFiscal(@Body() dto: OnboardingFiscalDto) {
    return this.onboarding.stepFiscal(dto);
  }

  @Post("step/catalog")
  stepCatalog(@Body() dto: OnboardingCatalogDto) {
    return this.onboarding.stepCatalog(dto);
  }

  @Post("step/golive")
  stepGoLive(@Body() dto: OnboardingGoLiveDto) {
    return this.onboarding.stepGoLive(dto);
  }

  @Get("pilot-status/:companyId")
  getPilotStatus(@Param("companyId") companyId: string) {
    return this.onboarding.getPilotStatus(companyId);
  }

  @Get("operational-checklist")
  getOperationalChecklist(@BranchId() branchId: string) {
    return this.onboarding.getOperationalChecklist(branchId);
  }

  @Patch("operational-checklist/:itemId")
  updateOperationalChecklistItem(
    @BranchId() branchId: string,
    @Param("itemId") itemId: string,
    @Body("done") done: boolean,
  ) {
    return this.onboarding.updateOperationalChecklistItem(branchId, itemId, done === true);
  }

  @Get("waiter-training")
  getWaiterTraining(@BranchId() branchId: string) {
    return this.onboarding.getWaiterTraining(branchId);
  }

  @Patch("waiter-training/:stepId")
  updateWaiterTrainingStep(
    @BranchId() branchId: string,
    @Param("stepId") stepId: string,
    @Body("done") done: boolean,
  ) {
    return this.onboarding.updateWaiterTrainingStep(branchId, stepId, done === true);
  }

  @Post("waiter-training/complete")
  completeWaiterTraining(@BranchId() branchId: string) {
    return this.onboarding.completeWaiterTraining(branchId);
  }
}
