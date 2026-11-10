import { Transform } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsString,
  Length,
  Validate,
  ValidatorConstraint,
} from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';
import {
  PUBLICATION_CATEGORIES,
  type PublicationCategory,
} from '../domain/publication-category';

function trimString({ value }: TransformFnParams): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@ValidatorConstraint({ name: 'isEventDate', async: false })
export class IsEventDateConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return false;
    }

    const today = new Date().toISOString().slice(0, 10);
    return value <= today;
  }

  defaultMessage(): string {
    return 'La fecha del evento debe ser una fecha válida (AAAA-MM-DD) y no puede ser futura.';
  }
}

export class CreatePublicationDto {
  @Transform(trimString)
  @IsString({ message: 'El título debe ser texto.' })
  @Length(3, 120, {
    message: 'El título debe tener entre 3 y 120 caracteres.',
  })
  title: string;

  @Transform(trimString)
  @IsString({ message: 'La descripción debe ser texto.' })
  @Length(10, 1000, {
    message: 'La descripción debe tener entre 10 y 1000 caracteres.',
  })
  description: string;

  @IsIn(PUBLICATION_CATEGORIES, { message: 'La categoría no es válida.' })
  category: PublicationCategory;

  @Transform(trimString)
  @IsString({ message: 'La ubicación debe ser texto.' })
  @Length(3, 120, {
    message: 'La ubicación debe tener entre 3 y 120 caracteres.',
  })
  location: string;

  @Validate(IsEventDateConstraint)
  eventDate: string;
}
