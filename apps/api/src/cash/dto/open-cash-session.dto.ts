import { IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class OpenCashSessionDto {
  @IsString()
  userId!: string;

  @IsOptional()
  @IsUUID()
  cashRegisterId?: string;

  @IsNumber()
  openingCash!: number;
}
