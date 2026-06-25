import { Module } from "@nestjs/common";
import { PilotController } from "./pilot.controller";
import { FiscalModule } from "../fiscal/fiscal.module";
import { PilotService } from "./pilot.service";
import { PosModule } from "../pos/pos.module";
import { RestaurantModule } from "../restaurant/restaurant.module";
import { CashModule } from "../cash/cash.module";
import { KdsModule } from "../kds/kds.module";
import { OnboardingModule } from "../onboarding/onboarding.module";

@Module({
  imports: [FiscalModule, PosModule, RestaurantModule, CashModule, KdsModule, OnboardingModule],
  controllers: [PilotController],
  providers: [PilotService],
})
export class PilotModule {}
