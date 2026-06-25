import { Module } from "@nestjs/common";
import { PrintController } from "./print.controller";
import { ReceiptService } from "./receipt.service";
import { PrintService } from "./print.service";
import { PrismaModule } from "../prisma/prisma.module";
import { TaxModule } from "../tax/tax.module";

@Module({
  imports: [PrismaModule, TaxModule],
  controllers: [PrintController],
  providers: [ReceiptService, PrintService],
  exports: [ReceiptService, PrintService],
})
export class PrintModule {}
