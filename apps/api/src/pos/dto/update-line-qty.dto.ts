import { IsDecimal } from "class-validator";

export class UpdateLineQtyDto {
  @IsDecimal()
  qty!: string;
}
