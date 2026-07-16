import { IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";

export class CreateCashMovementDto {
  @IsIn(["withdrawal", "deposit", "expense"])
  type!: "withdrawal" | "deposit" | "expense";

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
