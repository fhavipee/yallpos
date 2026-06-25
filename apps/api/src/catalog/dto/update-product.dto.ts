import { IsBoolean, IsIn, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  color?: string;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsNumber()
  price?: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  ivaTaxCode?: string;

  @IsOptional()
  @IsString()
  consumptionTaxCode?: string;

  /** @deprecated use ivaTaxCode */
  @IsOptional()
  @IsString()
  taxType?: string;

  /** @deprecated use consumptionTaxCode */
  @IsOptional()
  @IsString()
  consumptionTaxType?: string;

  @IsOptional()
  @IsIn(["standard", "combo", "recipe", "weight_based"])
  type?: string;

  @IsOptional()
  @IsBoolean()
  isIngredient?: boolean;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsBoolean()
  sellByWeight?: boolean;

  @IsOptional()
  @IsIn(["und", "kg", "g", "lb"])
  unit?: "und" | "kg" | "g" | "lb";
}
