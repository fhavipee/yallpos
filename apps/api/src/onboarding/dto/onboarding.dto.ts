import { IsDateString, IsIn, IsInt, IsNumber, IsOptional, IsString, MinLength } from "class-validator";

export class OnboardingBusinessDto {
  @IsString()
  tenantName!: string;

  @IsString()
  @MinLength(3)
  slug!: string;

  @IsString()
  ownerName!: string;

  @IsString()
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsString()
  companyName!: string;

  @IsString()
  nit!: string;

  @IsOptional()
  @IsString()
  dv?: string;

  @IsIn(["restaurant", "bakery", "cafe"])
  vertical!: "restaurant" | "bakery" | "cafe";

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  city?: string;
}

export class OnboardingBranchDto {
  @IsString()
  companyId!: string;

  @IsString()
  branchName!: string;

  @IsIn(["restaurant", "bakery", "cafe", "store"])
  branchType!: "restaurant" | "bakery" | "cafe" | "store";

  @IsOptional()
  @IsString()
  address?: string;
}

export class OnboardingFiscalDto {
  @IsString()
  companyId!: string;

  @IsString()
  prefix!: string;

  @IsInt()
  fromNumber!: number;

  @IsInt()
  toNumber!: number;

  @IsDateString()
  validFrom!: string;

  @IsDateString()
  validTo!: string;

  @IsOptional()
  @IsString()
  technicalKey?: string;
}

export class OnboardingCatalogDto {
  @IsString()
  branchId!: string;

  @IsIn(["restaurant", "bakery", "cafe"])
  template!: "restaurant" | "bakery" | "cafe";
}

export class OnboardingGoLiveDto {
  @IsString()
  branchId!: string;

  @IsNumber()
  openingCash!: number;

  @IsString()
  userId!: string;
}
