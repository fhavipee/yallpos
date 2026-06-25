import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { CatalogService } from "./catalog.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TaxModule } from "../tax/tax.module";

@Module({
  imports: [PrismaModule, TaxModule],
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
