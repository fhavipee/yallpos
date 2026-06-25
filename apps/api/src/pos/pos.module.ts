import { Module } from "@nestjs/common";
import { PosController } from "./pos.controller";
import { PosService } from "./pos.service";
import { KdsModule } from "../kds/kds.module";
import { FiscalModule } from "../fiscal/fiscal.module";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
  imports: [KdsModule, FiscalModule, NotificationsModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
