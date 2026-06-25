import { IsOptional, IsString } from "class-validator";

export class UpdatePickupDto {
  @IsOptional() @IsString() pickupName?: string;
  @IsOptional() @IsString() pickupPhone?: string;
}
