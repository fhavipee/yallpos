import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";

export const CUSTOMER_DOC_TYPES = ["CC", "NIT", "CE", "PA", "TI", "RC", "DIE"] as const;
export type CustomerDocType = (typeof CUSTOMER_DOC_TYPES)[number];

export class UpsertCustomerDto {
  @IsIn(CUSTOMER_DOC_TYPES)
  docType!: CustomerDocType;

  @IsOptional()
  @IsString()
  docNumber?: string;

  @IsOptional()
  @IsString()
  dv?: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  taxRegime?: string;

  @IsOptional()
  @IsString()
  fiscalResponsibilities?: string;

  @IsOptional()
  @IsBoolean()
  loyaltyEnabled?: boolean;

  @IsOptional()
  @IsString()
  loyaltyTier?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateGenericBuyerDto {
  @IsOptional()
  @IsIn(CUSTOMER_DOC_TYPES)
  defaultBuyerDocType?: CustomerDocType;

  @IsOptional()
  @IsString()
  @MinLength(3)
  defaultBuyerDocNumber?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  defaultBuyerName?: string;

  @IsOptional()
  @IsString()
  defaultBuyerDv?: string;
}

export class AttachCustomerDto {
  @IsOptional()
  @IsString()
  customerId?: string;

  /** Si true, pide factura nominada / con datos para FE */
  @IsOptional()
  @IsBoolean()
  requiresNamedBuyer?: boolean;

  /** Crear/actualizar cliente en el mismo paso */
  @IsOptional()
  customer?: UpsertCustomerDto;

  /** Aplicar discountPercent del cliente a la factura */
  @IsOptional()
  @IsBoolean()
  applyLoyaltyDiscount?: boolean;
}
