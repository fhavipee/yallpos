import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { AuthModule } from "../auth/auth.module";
import { FiscalModule } from "../fiscal/fiscal.module";
import { OnboardingModule } from "../onboarding/onboarding.module";
import { AuditService } from "../common/audit.service";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [PrismaModule, AuthModule, FiscalModule, OnboardingModule],
  controllers: [AdminController],
  providers: [AdminService, AuditService],
})
export class AdminModule {}
