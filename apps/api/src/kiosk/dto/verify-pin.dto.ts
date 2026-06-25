import { IsIn, IsString, MaxLength, MinLength } from "class-validator";

export class VerifyPinDto {
  @IsString()
  @MinLength(4)
  @MaxLength(6)
  pin!: string;

  @IsIn(["admin", "waiter"])
  type!: "admin" | "waiter";
}
