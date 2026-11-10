import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import { IsString, Length } from 'class-validator';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class CancelRecoveryRequestDto {
  @Transform(trimString)
  @IsString({ message: 'El motivo debe ser texto.' })
  @Length(3, 500, {
    message: 'El motivo debe tener entre 3 y 500 caracteres.',
  })
  reason: string;
}
