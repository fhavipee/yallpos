import { IsOptional, IsString, MaxLength } from "class-validator";

export class UpdatePickupDto {
  @IsOptional() @IsString() pickupName?: string;
  @IsOptional() @IsString() pickupPhone?: string;
  /** Número de localizador / buzzer entregado al cliente (ej. 042) */
  @IsOptional() @IsString() @MaxLength(6) pickupCode?: string;
}
