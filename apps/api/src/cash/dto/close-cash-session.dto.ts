import { IsNumber, IsOptional, IsString } from "class-validator";

export class CloseCashSessionDto {
  @IsNumber()
  closingCash!: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
