import { ValidatorConstraint } from 'class-validator';
import type { ValidatorConstraintInterface } from 'class-validator';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

@ValidatorConstraint({ name: 'isDateOnly', async: false })
export class IsDateOnlyConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
      return false;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);

    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  defaultMessage(): string {
    return 'La fecha debe tener formato AAAA-MM-DD y ser una fecha válida.';
  }
}
