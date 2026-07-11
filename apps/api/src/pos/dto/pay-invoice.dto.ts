import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDecimal,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from "class-validator";
import { UpsertCustomerDto } from "../../customers/dto/customer.dto";

/** Datos de tarjeta / datafono / transferencia / QR (PCI: sin PAN ni CVV). */
export class PaymentDetailsDto {
  @IsOptional()
  @IsString()
  authCode?: string;

  @IsOptional()
  @IsString()
  rrn?: string;

  @IsOptional()
  @IsString()
  franchise?: string;

  @IsOptional()
  @IsString()
  lastFour?: string;

  @IsOptional()
  @IsIn(["credit", "debit"])
  accountType?: "credit" | "debit";

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(48)
  installments?: number;

  @IsOptional()
  @IsString()
  terminalId?: string;

  @IsOptional()
  @IsString()
  merchantId?: string;

  @IsOptional()
  @IsIn(["chip", "contactless", "swipe", "keyed", "qr", "manual"])
  entryMode?: "chip" | "contactless" | "swipe" | "keyed" | "qr" | "manual";

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  externalTxnId?: string;

  @IsOptional()
  @IsString()
  bankName?: string;

  /** Respuesta completa del datafono / SDK (JSON) */
  @IsOptional()
  @IsObject()
  terminalPayload?: Record<string, unknown>;
}

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

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  details?: PaymentDetailsDto;
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

/** Normaliza respuesta de datafono hacia campos de Payment (integración futura). */
export class TerminalPaymentResultDto {
  @IsDecimal()
  amount!: string;

  @IsOptional()
  @IsIn(["card", "qr", "transfer"])
  method?: "card" | "qr" | "transfer";

  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDetailsDto)
  details?: PaymentDetailsDto;

  @IsOptional()
  @IsObject()
  raw?: Record<string, unknown>;
}
