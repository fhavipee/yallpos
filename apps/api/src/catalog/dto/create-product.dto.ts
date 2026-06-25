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
  @IsIn(["iva_19", "iva_5", "exento", "no_gravado"])
  taxType?: "iva_19" | "iva_5" | "exento" | "no_gravado";

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
