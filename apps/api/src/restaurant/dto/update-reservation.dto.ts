import { IsIn, IsOptional, IsString } from "class-validator";

export class UpdateReservationDto {
  @IsOptional()
  @IsIn(["pending", "seated", "cancelled", "no_show"])
  status?: "pending" | "seated" | "cancelled" | "no_show";

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  tableId?: string;
}
