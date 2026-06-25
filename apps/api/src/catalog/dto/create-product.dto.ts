import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, IsUUID } from "class-validator";

export class CreateProductDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(["standard", "combo", "recipe", "weight_based"])
  type?: "standard" | "combo" | "recipe" | "weight_based";

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
  @IsBoolean()
  isIngredient?: boolean;

  @IsOptional()
  @IsString()
  course?: string;

  @IsOptional()
  @IsString()
  variantName?: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsOptional()
  @IsString()
  barcode?: string;

  @IsNumber()
  price!: number;

  @IsOptional()
  @IsNumber()
  cost?: number;

  @IsOptional()
  @IsBoolean()
  sellByWeight?: boolean;

  @IsOptional()
  @IsIn(["und", "kg", "g", "lb"])
  unit?: "und" | "kg" | "g" | "lb";
}
