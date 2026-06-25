import { Type } from "class-transformer";
import { IsArray, IsDecimal, IsOptional, IsString, ValidateNested } from "class-validator";

class ModifierInput {
  @IsString()
  name!: string;

  @IsOptional()
  @IsDecimal()
  priceDelta?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddLineDto {
  @IsString()
  variantId!: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  course?: string;

  @IsDecimal()
  qty!: string;

  @IsDecimal()
  unitPrice!: string;

  @IsOptional()
  @IsDecimal()
  weight?: string;

  @IsOptional()
  @IsString()
  lineNotes?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModifierInput)
  modifiers?: ModifierInput[];
}
