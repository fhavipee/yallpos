import { IsDateString, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateReservationDto {
  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  customerPhone?: string;

  @IsInt()
  @Min(1)
  guestsCount!: number;

  @IsDateString()
  reservedFor!: string;

  @IsOptional()
  @IsString()
  tableId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
