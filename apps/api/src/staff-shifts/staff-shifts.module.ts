import { Module } from "@nestjs/common";
import { StaffShiftsController } from "./staff-shifts.controller";
import { StaffShiftsService } from "./staff-shifts.service";

@Module({
  controllers: [StaffShiftsController],
  providers: [StaffShiftsService],
  exports: [StaffShiftsService],
})
export class StaffShiftsModule {}
