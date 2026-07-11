import { Module, forwardRef } from "@nestjs/common";
import { FiscalController } from "./fiscal.controller";
import { FiscalService } from "./fiscal.service";
import { DianXmlBuilder } from "./dian-xml.builder";
import { DianClient } from "./dian.client";
import { DianXmlSigner } from "./dian-xml.signer";
import { DianCertificateService } from "./dian-certificate.service";
import { CustomersModule } from "../customers/customers.module";

@Module({
  imports: [forwardRef(() => CustomersModule)],
  controllers: [FiscalController],
  providers: [
    FiscalService,
    DianXmlBuilder,
    DianClient,
    DianXmlSigner,
    DianCertificateService,
  ],
  exports: [FiscalService, DianCertificateService],
})
export class FiscalModule {}
