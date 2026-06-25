import { IsInt, IsOptional, IsString, Min } from "class-validator";

export class OpenTableSessionDto {
  @IsString()
  tableId!: string;

  @IsString()
  waiterId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  guestsCount?: number;
}
