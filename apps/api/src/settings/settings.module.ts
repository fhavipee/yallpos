import { Module } from "@nestjs/common";
import { SettingsController } from "./settings.controller";
import { SettingsService } from "./settings.service";
import { KioskModule } from "../kiosk/kiosk.module";

@Module({
  imports: [KioskModule],
  controllers: [SettingsController],
  providers: [SettingsService],
})
export class SettingsModule {}
