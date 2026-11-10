import type { ValidationError } from 'class-validator';

export interface ValidationErrorDetail {
  field: string;
  message: string;
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): ValidationErrorDetail[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    const own = error.constraints
      ? Object.values(error.constraints).map((message) => ({
          field,
          message,
        }))
      : [];

    return [
      ...own,
      ...flattenValidationErrors(error.children ?? [], field),
    ];
  });
}
