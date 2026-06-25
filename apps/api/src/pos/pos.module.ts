import { Module } from "@nestjs/common";
import { PosController } from "./pos.controller";
import { PosService } from "./pos.service";
import { KdsModule } from "../kds/kds.module";
import { FiscalModule } from "../fiscal/fiscal.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { TaxModule } from "../tax/tax.module";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule, KdsModule, FiscalModule, NotificationsModule, TaxModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}
