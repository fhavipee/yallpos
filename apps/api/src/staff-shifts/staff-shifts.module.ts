import { Module } from "@nestjs/common";
import { StaffShiftsController } from "./staff-shifts.controller";
import { StaffShiftsService } from "./staff-shifts.service";
import { BiometricService } from "./biometric.service";

@Module({
  controllers: [StaffShiftsController],
  providers: [StaffShiftsService, BiometricService],
  exports: [StaffShiftsService],
})
export class StaffShiftsModule {}
