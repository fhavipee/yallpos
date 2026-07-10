import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export class UpdateBranchMetaDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsIn(["restaurant", "bakery", "cafe", "store"]) type?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class CreateBranchDto {
  @IsString() companyId!: string;
  @IsString() name!: string;
  @IsIn(["restaurant", "bakery", "cafe", "store"]) type!: string;
  @IsOptional() @IsString() address?: string;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsIn(["image", "description"]) mobileDisplay?: "image" | "description";
  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertAreaDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertTableDto {
  @IsString() diningAreaId!: string;
  @IsString() name!: string;
  @IsOptional() @IsInt() @Min(1) capacity?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertStaffDto {
  @IsString() name!: string;
  @IsIn(["waiter", "cashier", "kitchen", "manager", "baker"]) role!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(6) pin?: string;
  @IsOptional() @IsBoolean() clearPin?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsIn(["owner", "manager", "cashier", "waiter", "kitchen", "baker"]) role?: string;
  @IsOptional() @IsString() roleId?: string;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsString() @MinLength(4) @MaxLength(6) pin?: string;
  @IsOptional() @IsBoolean() clearPin?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertTenantRoleDto {
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsArray() @IsString({ each: true }) permissions!: string[];
  @IsOptional() @IsIn(["owner", "manager", "cashier", "waiter", "kitchen", "baker"]) legacyRole?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class ResetPasswordDto {
  @IsString() @MinLength(6) password!: string;
}

export class UpsertKdsStationDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsString() printerIp?: string;
  @IsOptional() @IsInt() printerPort?: number;
  @IsOptional() @IsString() printerName?: string;
}

export class UpsertKdsRoutingDto {
  @IsString() stationId!: string;
  @IsOptional() @IsString() variantId?: string;
  @IsOptional() @IsString() course?: string;
}

export class UpsertCashRegisterDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertWarehouseDto {
  @IsString() name!: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AdjustStockDto {
  @IsString() warehouseId!: string;
  @IsString() variantId!: string;
  @IsNumber() quantity!: number;
}

export class UpsertModifierGroupDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() minSelect?: number;
  @IsOptional() @IsInt() maxSelect?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) productIds?: string[];
}

export class UpsertModifierOptionDto {
  @IsString() name!: string;
  @IsOptional() @IsNumber() priceDelta?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpsertTaxDefinitionDto {
  @IsIn(["iva", "consumption"]) kind!: "iva" | "consumption";
  @IsString() code!: string;
  @IsString() name!: string;
  @IsNumber() rate!: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateTaxDefinitionDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() rate?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class CreateFiscalResolutionDto {
  @IsIn(["invoice", "pos_equivalent", "credit_note", "debit_note"]) docType!: string;
  @IsString() prefix!: string;
  @IsInt() fromNumber!: number;
  @IsInt() toNumber!: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
  @IsOptional() @IsString() technicalKey?: string;
}

export class UpdateFiscalResolutionAdminDto {
  @IsOptional() @IsString() prefix?: string;
  @IsOptional() @IsInt() fromNumber?: number;
  @IsOptional() @IsInt() toNumber?: number;
  @IsOptional() @IsString() validFrom?: string;
  @IsOptional() @IsString() validTo?: string;
  @IsOptional() @IsString() technicalKey?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PaymentMethodsDto {
  @IsArray()
  @IsIn(["cash", "card", "transfer", "qr", "credit", "voucher", "mixed"], { each: true })
  enabled!: string[];
}

export class UpdateCompanyAdminDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() razonSocial?: string;
  @IsOptional() @IsString() nit?: string;
  @IsOptional() @IsString() dv?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() department?: string;
  @IsOptional() @IsIn(["restaurant", "bakery", "cafe", "minimarket", "retail"]) vertical?: string;
}
