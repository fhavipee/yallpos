import { Type } from "class-transformer";
import { IsArray, IsDecimal, IsIn, IsOptional, IsString, ValidateNested } from "class-validator";

class PaymentInput {
  @IsIn(["cash", "card", "transfer", "qr", "credit", "voucher", "mixed"])
  method!: "cash" | "card" | "transfer" | "qr" | "credit" | "voucher" | "mixed";

  @IsDecimal()
  amount!: string;

  @IsOptional()
  @IsDecimal()
  tipAmount?: string;

  @IsOptional()
  @IsString()
  reference?: string;
}

export class PayInvoiceDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentInput)
  payments!: PaymentInput[];

  @IsOptional()
  @IsDecimal()
  tipAmount?: string;
}
