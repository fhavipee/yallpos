import { Module } from "@nestjs/common";
import { PrintController } from "./print.controller";
import { ReceiptService } from "./receipt.service";
import { PrintService } from "./print.service";

@Module({
  controllers: [PrintController],
  providers: [ReceiptService, PrintService],
  exports: [ReceiptService, PrintService],
})
export class PrintModule {}
