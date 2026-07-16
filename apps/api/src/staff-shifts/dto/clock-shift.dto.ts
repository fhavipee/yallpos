import { IsOptional, IsString } from "class-validator";

export class ClockShiftDto {
  @IsOptional()
  @IsString()
  notes?: string;
}
