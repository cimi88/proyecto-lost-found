import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { ValidationError } from 'class-validator';
import { CreateFoundPublicationDto } from './create-found-publication.dto';
import { CreateLostPublicationDto } from './create-lost-publication.dto';
import type { CreatePublicationDto } from './create-publication.dto';

type PublicationDtoConstructor = new () => CreatePublicationDto;

const DTO_VARIANTS: Array<{
  name: string;
  ctor: PublicationDtoConstructor;
}> = [
  { name: 'CreateLostPublicationDto', ctor: CreateLostPublicationDto },
  { name: 'CreateFoundPublicationDto', ctor: CreateFoundPublicationDto },
];

function validPayload(): Record<string, unknown> {
  return {
    title: 'Bicicleta rodado 29',
    description: 'Bicicleta azul con canasto negro y una calcomanía.',
    category: 'SPORTS',
    location: 'Plaza San Martín',
    eventDate: '2024-05-10',
  };
}

async function validatePayload(
  ctor: PublicationDtoConstructor,
  payload: Record<string, unknown>,
): Promise<ValidationError[]> {
  const dto = plainToInstance(ctor, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

function properties(errors: ValidationError[]): string[] {
  return errors.map((error) => error.property);
}

describe.each(DTO_VARIANTS)('$name (shared validation matrix)', ({
  ctor,
}) => {
  it('accepts a valid payload', async () => {
    const errors = await validatePayload(ctor, validPayload());

    expect(errors).toHaveLength(0);
  });

  it('trims text fields', async () => {
    const payload = {
      ...validPayload(),
      title: '  Bicicleta rodado 29  ',
      description: '  Bicicleta azul con canasto negro y una calcomanía.  ',
      location: '  Plaza San Martín  ',
    };
    const errors = await validatePayload(ctor, payload);
    const dto = plainToInstance(ctor, payload);

    expect(errors).toHaveLength(0);
    expect(dto.title).toBe('Bicicleta rodado 29');
    expect(dto.description).toBe(
      'Bicicleta azul con canasto negro y una calcomanía.',
    );
    expect(dto.location).toBe('Plaza San Martín');
  });

  it.each([
    { label: 'shorter than 3 characters', title: 'ab' },
    { label: 'longer than 120 characters', title: 'x'.repeat(121) },
  ])('rejects a title $label', async ({ title }) => {
    const errors = await validatePayload(ctor, { ...validPayload(), title });

    expect(properties(errors)).toContain('title');
  });

  it('rejects a description shorter than 10 characters', async () => {
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      description: 'corta',
    });

    expect(properties(errors)).toContain('description');
  });

  it('rejects a category outside the nine agreed values', async () => {
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      category: 'FURNITURE',
    });

    expect(properties(errors)).toContain('category');
  });

  it('rejects a location shorter than 3 characters', async () => {
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      location: 'x',
    });

    expect(properties(errors)).toContain('location');
  });

  it.each(['15/05/2024', '2024-5-10', 'ayer'])(
    'rejects an eventDate with an invalid format (%s)',
    async (eventDate) => {
      const errors = await validatePayload(ctor, {
        ...validPayload(),
        eventDate,
      });

      expect(properties(errors)).toContain('eventDate');
    },
  );

  it('rejects a nonexistent eventDate (2024-02-30)', async () => {
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      eventDate: '2024-02-30',
    });

    expect(properties(errors)).toContain('eventDate');
  });

  it('rejects a future eventDate', async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      eventDate: tomorrow,
    });

    expect(properties(errors)).toContain('eventDate');
  });

  it.each([
    { field: 'type', value: 'LOST' },
    { field: 'status', value: 'CLOSED' },
    {
      field: 'ownerId',
      value: '00000000-0000-4000-8000-0000000000ff',
    },
  ])('rejects the server-controlled field $field', async ({ field, value }) => {
    const errors = await validatePayload(ctor, {
      ...validPayload(),
      [field]: value,
    });

    expect(properties(errors)).toContain(field);
  });
});
