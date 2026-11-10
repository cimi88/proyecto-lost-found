import { Transform, Type } from 'class-transformer';
import type { TransformFnParams } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  Validate,
} from 'class-validator';
import { IsDateOnlyConstraint } from '../../common/validation/is-date-only.validator';
import {
  PUBLICATION_CATEGORIES,
  type PublicationCategory,
} from '../domain/publication-category';
import {
  DEFAULT_PUBLICATION_SORT,
  PUBLICATION_SORTS,
  type PublicationSort,
} from '../domain/publication-sort';
import {
  PUBLICATION_TYPES,
  type PublicationType,
} from '../domain/publication-status';

function trimOptionalQuery({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

function trimSort({ value }: TransformFnParams): unknown {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? DEFAULT_PUBLICATION_SORT : trimmed;
}

export class PublicationQueryDto {
  @Transform(trimOptionalQuery)
  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser texto.' })
  @MinLength(1, {
    message: 'El término de búsqueda debe tener al menos 1 carácter.',
  })
  @MaxLength(100, {
    message: 'El término de búsqueda no puede superar los 100 caracteres.',
  })
  q?: string;

  @Transform(trimOptionalQuery)
  @IsOptional()
  @IsIn(PUBLICATION_TYPES, {
    message: 'El tipo debe ser LOST o FOUND.',
  })
  type?: PublicationType;

  @Transform(trimOptionalQuery)
  @IsOptional()
  @IsIn(PUBLICATION_CATEGORIES, {
    message: 'La categoría no es válida.',
  })
  category?: PublicationCategory;

  @Transform(trimOptionalQuery)
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  eventDateFrom?: string;

  @Transform(trimOptionalQuery)
  @IsOptional()
  @Validate(IsDateOnlyConstraint)
  eventDateTo?: string;

  @Transform(trimSort)
  @IsOptional()
  @IsIn(PUBLICATION_SORTS, {
    message: 'El orden debe ser recent, oldest o relevance.',
  })
  sort: PublicationSort = DEFAULT_PUBLICATION_SORT;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'La página debe ser un número entero.' })
  @Min(1, { message: 'La página debe ser mayor o igual a 1.' })
  page: number = 1;

  @Type(() => Number)
  @IsOptional()
  @IsInt({ message: 'El tamaño de página debe ser un número entero.' })
  @Min(1, { message: 'El tamaño de página debe ser mayor o igual a 1.' })
  @Max(50, { message: 'El tamaño de página no puede superar 50.' })
  pageSize: number = 12;
}
