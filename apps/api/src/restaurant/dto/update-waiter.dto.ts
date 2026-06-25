import { IsOptional, IsString } from "class-validator";

export class UpdateWaiterDto {
  @IsOptional() @IsString() phone?: string;
}
