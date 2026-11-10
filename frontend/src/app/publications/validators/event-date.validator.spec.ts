import { FormControl } from '@angular/forms';
import { eventDateValidator } from './event-date.validator';

function validate(value: string) {
  return eventDateValidator(new FormControl(value));
}

describe('eventDateValidator', () => {
  it('accepts a past date', () => {
    expect(validate('2024-05-10')).toBeNull();
  });

  it('accepts today', () => {
    const today = new Date().toISOString().slice(0, 10);

    expect(validate(today)).toBeNull();
  });

  it('rejects a future date', () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    expect(validate(tomorrow)).toEqual({ eventDate: true });
  });

  it.each(['2026-02-31', '15/05/2024', '2024-5-10', ''])(
    'rejects invalid value %s',
    (value) => {
      expect(validate(value)).toEqual({ eventDate: true });
    },
  );
});
