import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from "class-validator";
import { UpsertCustomerDto } from "../../customers/dto/customer.dto";

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

  /** Cliente pide factura con datos (nominada / electrónica) */
  @IsOptional()
  @IsBoolean()
  requiresNamedBuyer?: boolean;

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertCustomerDto)
  customer?: UpsertCustomerDto;

  /** Aplicar % de descuento de fidelización del cliente */
  @IsOptional()
  @IsBoolean()
  applyLoyaltyDiscount?: boolean;
}
