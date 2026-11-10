import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

function trimOptionalNotes({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

export class CreateRecoveryRequestDto {
  @Transform(trimOptionalNotes)
  @IsOptional()
  @IsString({ message: 'Las notas deben ser texto.' })
  @MaxLength(500, { message: 'Las notas no pueden superar 500 caracteres.' })
  notes?: string;
}
