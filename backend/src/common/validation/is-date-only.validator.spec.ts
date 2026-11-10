import { IsDateOnlyConstraint } from './is-date-only.validator';

describe('IsDateOnlyConstraint', () => {
  const constraint = new IsDateOnlyConstraint();

  it.each(['2024-01-01', '2024-02-29', '1999-12-31', '2026-11-06'])(
    'accepts the valid date %p',
    (value) => {
      expect(constraint.validate(value)).toBe(true);
    },
  );

  it.each([
    '2024-02-30',
    '2023-02-29',
    '2024-13-01',
    '2024-00-10',
    '2024-1-1',
    '06/11/2026',
    '2024-01-01T00:00:00Z',
    '',
    '   ',
  ])('rejects the invalid date %p', (value) => {
    expect(constraint.validate(value)).toBe(false);
  });

  it.each([null, undefined, 20240101, new Date('2024-01-01')])(
    'rejects the non-text value %p',
    (value) => {
      expect(constraint.validate(value)).toBe(false);
    },
  );

  it('exposes a Spanish validation message', () => {
    expect(constraint.defaultMessage()).toContain('AAAA-MM-DD');
  });
});
