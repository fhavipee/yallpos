import { IsEmail, IsIn, IsString, MinLength } from "class-validator";

export class RegisterTenantDto {
  @IsString()
  tenantName!: string;

  @IsString()
  @MinLength(3)
  slug!: string;

  @IsString()
  ownerName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  companyName!: string;

  @IsIn(["restaurant", "bakery", "cafe"])
  vertical!: "restaurant" | "bakery" | "cafe";
}
