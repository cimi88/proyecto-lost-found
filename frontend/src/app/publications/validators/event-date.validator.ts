import type { AbstractControl, ValidationErrors } from '@angular/forms';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function eventDateValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value: unknown = control.value;

  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) {
    return { eventDate: true };
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return { eventDate: true };
  }

  const today = new Date().toISOString().slice(0, 10);

  return value <= today ? null : { eventDate: true };
}
