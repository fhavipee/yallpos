import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { RestaurantModule } from "./restaurant/restaurant.module";
import { KdsModule } from "./kds/kds.module";
import { PosModule } from "./pos/pos.module";
import { AuthModule } from "./auth/auth.module";
import { CatalogModule } from "./catalog/catalog.module";
import { FiscalModule } from "./fiscal/fiscal.module";
import { CashModule } from "./cash/cash.module";
import { PrintModule } from "./print/print.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { ReportsModule } from "./reports/reports.module";
import { PilotModule } from "./pilot/pilot.module";
import { SettingsModule } from "./settings/settings.module";
import { AdminModule } from "./admin/admin.module";
import { KioskModule } from "./kiosk/kiosk.module";
import { CustomersModule } from "./customers/customers.module";
import { StaffShiftsModule } from "./staff-shifts/staff-shifts.module";
import { HealthController } from "./health.controller";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CatalogModule,
    FiscalModule,
    CashModule,
    PrintModule,
    OnboardingModule,
    ReportsModule,
    PilotModule,
    SettingsModule,
    AdminModule,
    KioskModule,
    CustomersModule,
    StaffShiftsModule,
    RestaurantModule,
    KdsModule,
    PosModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
