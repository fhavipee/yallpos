import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TaxDefinitionService } from "./tax-definition.service";

@Module({
  imports: [PrismaModule],
  providers: [TaxDefinitionService],
  exports: [TaxDefinitionService],
})
export class TaxModule {}
