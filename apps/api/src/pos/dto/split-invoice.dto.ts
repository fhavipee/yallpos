import { ArrayMinSize, IsArray, IsString } from "class-validator";

export class SplitInvoiceDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  lineIds!: string[];
}
