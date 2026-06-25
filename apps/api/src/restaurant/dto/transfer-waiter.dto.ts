import { IsString } from "class-validator";

export class TransferWaiterDto {
  @IsString()
  newWaiterId!: string;
}
