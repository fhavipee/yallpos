import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { CustomersController, InvoiceCustomerController } from "./customers.controller";
import { CustomersService } from "./customers.service";

@Module({
  imports: [PrismaModule],
  controllers: [CustomersController, InvoiceCustomerController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
