import { IsIn, IsOptional, IsString } from "class-validator";

export class ApplyInvoiceDiscountDto {
  @IsIn(["amount", "percent", "clear"])
  kind!: "amount" | "percent" | "clear";

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  approvalPin?: string;

  @IsOptional()
  @IsString()
  approvalTotp?: string;
}

export class ApplyLineDiscountDto {
  @IsIn(["courtesy", "amount", "percent", "clear"])
  kind!: "courtesy" | "amount" | "percent" | "clear";

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  approvalPin?: string;

  @IsOptional()
  @IsString()
  approvalTotp?: string;
}
