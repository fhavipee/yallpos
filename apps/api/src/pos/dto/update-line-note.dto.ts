import { IsOptional, IsString } from "class-validator";

export class UpdateLineNoteDto {
  @IsOptional()
  @IsString()
  lineNotes?: string;
}
