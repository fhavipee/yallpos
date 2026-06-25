import { IsArray, IsOptional, IsString } from "class-validator";

export class DailyMenuItemDto {
  @IsString()
  productId!: string;

  @IsOptional()
  priceOverride?: number;
}

export class UpdateDailyMenuDto {
  @IsOptional()
  @IsString()
  note?: string;

  @IsArray()
  items!: { productId: string; priceOverride?: number }[];
}
