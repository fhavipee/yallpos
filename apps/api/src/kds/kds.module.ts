import { Module } from "@nestjs/common";
import { KdsController } from "./kds.controller";
import { KdsService } from "./kds.service";
import { KdsGateway } from "./kds.gateway";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [NotificationsModule],
  controllers: [KdsController],
  providers: [KdsService, KdsGateway],
  exports: [KdsService],
})
export class KdsModule {}
