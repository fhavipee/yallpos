import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateInvoiceDto {
  @IsOptional()
  @IsString()
  tableSessionId?: string;

  @IsIn(["dine_in", "takeaway", "delivery"])
  serviceType!: "dine_in" | "takeaway" | "delivery";

  @IsOptional()
  @IsString()
  notes?: string;
}
