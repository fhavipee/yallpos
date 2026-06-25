import { IsDecimal, IsOptional, IsString } from "class-validator";

export class UpdateDeliveryDto {
  @IsOptional() @IsString() deliveryName?: string;
  @IsOptional() @IsString() deliveryPhone?: string;
  @IsOptional() @IsString() deliveryAddress?: string;
  @IsOptional() @IsString() deliveryReference?: string;
  @IsOptional() @IsDecimal() deliveryFee?: string;
}
