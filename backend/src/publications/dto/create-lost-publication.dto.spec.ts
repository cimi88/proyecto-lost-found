import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { PUBLICATION_CATEGORIES } from '../domain/publication-category';
import { CreateLostPublicationDto } from './create-lost-publication.dto';

function validPayload(): Record<string, unknown> {
  return {
    title: 'Bicicleta rodado 29',
    description:
      'Bicicleta azul con canasto negro y una calcomanía en el cuadro.',
    category: 'SPORTS',
    location: 'Plaza San Martín',
    eventDate: '2024-05-10',
  };
}

async function validatePayload(
  payload: Record<string, unknown>,
): Promise<ValidationError[]> {
  const dto = plainToInstance(CreateLostPublicationDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

function properties(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe('CreateLostPublicationDto', () => {
  it('keeps exactly the nine agreed categories', () => {
    expect(PUBLICATION_CATEGORIES).toEqual([
      'ELECTRONICS',
      'DOCUMENTS',
      'KEYS',
      'BAGS',
      'CLOTHING',
      'ACCESSORIES',
      'BOOKS',
      'SPORTS',
      'OTHER',
    ]);
  });

  it('accepts a valid payload and trims text fields', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      title: '  Bicicleta rodado 29  ',
    });
    const dto = plainToInstance(CreateLostPublicationDto, {
      ...validPayload(),
      title: '  Bicicleta rodado 29  ',
    });

    expect(errors).toHaveLength(0);
    expect(dto.title).toBe('Bicicleta rodado 29');
  });

  it('rejects a title shorter than 3 characters', async () => {
    const errors = await validatePayload({ ...validPayload(), title: 'ab' });

    expect(properties(errors)).toContain('title');
  });

  it('rejects a description shorter than 10 characters', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      description: 'corta',
    });

    expect(properties(errors)).toContain('description');
  });

  it('rejects a location shorter than 3 characters', async () => {
    const errors = await validatePayload({ ...validPayload(), location: 'x' });

    expect(properties(errors)).toContain('location');
  });

  it('rejects a category outside the nine agreed values', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      category: 'FURNITURE',
    });

    expect(properties(errors)).toContain('category');
  });

  it('rejects a date in the future', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const errors = await validatePayload({
      ...validPayload(),
      eventDate: tomorrow,
    });

    expect(properties(errors)).toContain('eventDate');
  });

  it.each(['2026-02-31', '15/05/2024', '2024-5-10', 'ayer'])(
    'rejects invalid eventDate %s',
    async (eventDate) => {
      const errors = await validatePayload({ ...validPayload(), eventDate });

      expect(properties(errors)).toContain('eventDate');
    },
  );

  it('rejects unknown properties', async () => {
    const errors = await validatePayload({
      ...validPayload(),
      ownerId: '00000000-0000-4000-8000-000000000001',
    });

    expect(errors.length).toBeGreaterThan(0);
  });
});
