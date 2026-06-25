import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class WaiterAttributionDto {
  @IsOptional()
  @IsString()
  waiterId?: string;

  @IsOptional()
  @IsString()
  waiterStaffId?: string;

  @IsOptional()
  @IsString()
  waiterUserId?: string;
}

export class OpenTableSessionDto extends WaiterAttributionDto {
  @IsString()
  tableId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestsCount?: number;
}
