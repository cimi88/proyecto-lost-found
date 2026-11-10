import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { PublicationQueryDto } from './publication-query.dto';

async function validatePayload(
  payload: Record<string, unknown>,
): Promise<{ dto: PublicationQueryDto; errors: ValidationError[] }> {
  const dto = plainToInstance(PublicationQueryDto, payload);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });

  return { dto, errors };
}

function properties(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe('PublicationQueryDto', () => {
  it('applies the default page and pageSize', async () => {
    const { dto, errors } = await validatePayload({});

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(1);
    expect(dto.pageSize).toBe(12);
    expect(dto.q).toBeUndefined();
    expect(dto.type).toBeUndefined();
    expect(dto.category).toBeUndefined();
    expect(dto.eventDateFrom).toBeUndefined();
    expect(dto.eventDateTo).toBeUndefined();
    expect(dto.sort).toBe('recent');
  });

  it('coerces numeric query strings to numbers', async () => {
    const { dto, errors } = await validatePayload({
      page: '3',
      pageSize: '25',
    });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(3);
    expect(dto.pageSize).toBe(25);
  });

  it('trims the search term', async () => {
    const { dto, errors } = await validatePayload({
      q: '  bicicleta  ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.q).toBe('bicicleta');
  });

  it.each(['', '   '])(
    'treats an empty search term (%p) as absent',
    async (q) => {
      const { dto, errors } = await validatePayload({ q });

      expect(errors).toHaveLength(0);
      expect(dto.q).toBeUndefined();
    },
  );

  it('accepts a search term of exactly 100 characters', async () => {
    const { dto, errors } = await validatePayload({ q: 'x'.repeat(100) });

    expect(errors).toHaveLength(0);
    expect(dto.q).toHaveLength(100);
  });

  it('rejects a search term longer than 100 characters', async () => {
    const { errors } = await validatePayload({ q: 'x'.repeat(101) });

    expect(properties(errors)).toContain('q');
  });

  it.each([0, -1, 1.5, 'abc'])(
    'rejects an invalid page (%p)',
    async (page) => {
      const { errors } = await validatePayload({ page });

      expect(properties(errors)).toContain('page');
    },
  );

  it.each([0, 51, 1.5, 'abc'])(
    'rejects an invalid pageSize (%p)',
    async (pageSize) => {
      const { errors } = await validatePayload({ pageSize });

      expect(properties(errors)).toContain('pageSize');
    },
  );

  it('accepts every supported filter and sort value', async () => {
    const { dto, errors } = await validatePayload({
      type: 'FOUND',
      category: 'KEYS',
      eventDateFrom: '2024-01-01',
      eventDateTo: '2024-12-31',
      sort: 'oldest',
    });

    expect(errors).toHaveLength(0);
    expect(dto.type).toBe('FOUND');
    expect(dto.category).toBe('KEYS');
    expect(dto.eventDateFrom).toBe('2024-01-01');
    expect(dto.eventDateTo).toBe('2024-12-31');
    expect(dto.sort).toBe('oldest');
  });

  it('accepts relevance as a sort value', async () => {
    const { dto, errors } = await validatePayload({
      q: 'bicicleta',
      sort: 'relevance',
    });

    expect(errors).toHaveLength(0);
    expect(dto.sort).toBe('relevance');
  });

  it.each(['LOST', 'FOUND'])('accepts the publication type %p', async (type) => {
    const { dto, errors } = await validatePayload({ type });

    expect(errors).toHaveLength(0);
    expect(dto.type).toBe(type);
  });

  it.each([
    'ELECTRONICS',
    'DOCUMENTS',
    'KEYS',
    'BAGS',
    'CLOTHING',
    'ACCESSORIES',
    'BOOKS',
    'SPORTS',
    'OTHER',
  ])('accepts the publication category %p', async (category) => {
    const { dto, errors } = await validatePayload({ category });

    expect(errors).toHaveLength(0);
    expect(dto.category).toBe(category);
  });

  it('trims filter values', async () => {
    const { dto, errors } = await validatePayload({
      type: '  LOST  ',
      category: '  SPORTS  ',
      eventDateFrom: '  2024-01-01  ',
      eventDateTo: '  2024-12-31  ',
      sort: '  oldest  ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.type).toBe('LOST');
    expect(dto.category).toBe('SPORTS');
    expect(dto.eventDateFrom).toBe('2024-01-01');
    expect(dto.eventDateTo).toBe('2024-12-31');
    expect(dto.sort).toBe('oldest');
  });

  it('treats empty filter values as absent and defaults the sort', async () => {
    const { dto, errors } = await validatePayload({
      type: '',
      category: '   ',
      eventDateFrom: '',
      eventDateTo: '   ',
      sort: '   ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.type).toBeUndefined();
    expect(dto.category).toBeUndefined();
    expect(dto.eventDateFrom).toBeUndefined();
    expect(dto.eventDateTo).toBeUndefined();
    expect(dto.sort).toBe('recent');
  });

  it.each(['RESERVED', 'RETURNED', 'CLOSED', 'OTHER'])(
    'rejects the invalid publication type %p',
    async (type) => {
      const { errors } = await validatePayload({ type });

      expect(properties(errors)).toContain('type');
    },
  );

  it('rejects an invalid category', async () => {
    const { errors } = await validatePayload({ category: 'VEHICLES' });

    expect(properties(errors)).toContain('category');
  });

  it.each(['2024-02-30', '2024-13-01', '06/11/2026', '2024-1-1'])(
    'rejects the invalid eventDateFrom %p',
    async (eventDateFrom) => {
      const { errors } = await validatePayload({ eventDateFrom });

      expect(properties(errors)).toContain('eventDateFrom');
    },
  );

  it('rejects an invalid eventDateTo', async () => {
    const { errors } = await validatePayload({
      eventDateTo: '2024-02-30',
    });

    expect(properties(errors)).toContain('eventDateTo');
  });

  it('rejects an invalid sort value', async () => {
    const { errors } = await validatePayload({ sort: 'createdAt' });

    expect(properties(errors)).toContain('sort');
  });

  it.each([
    { payload: { type: ['LOST', 'FOUND'] }, field: 'type' },
    { payload: { category: ['KEYS', 'BAGS'] }, field: 'category' },
    {
      payload: { eventDateFrom: ['2024-01-01', '2024-02-01'] },
      field: 'eventDateFrom',
    },
    {
      payload: { eventDateTo: ['2024-01-01', '2024-02-01'] },
      field: 'eventDateTo',
    },
    { payload: { sort: ['recent', 'oldest'] }, field: 'sort' },
  ])(
    'rejects a repeated filter value for $field',
    async ({ payload, field }) => {
      const { errors } = await validatePayload(payload);

      expect(properties(errors)).toContain(field);
    },
  );

  it('rejects unknown query parameters', async () => {
    const { errors } = await validatePayload({ ownerId: 'unknown' });

    expect(properties(errors)).toContain('ownerId');
  });
});
