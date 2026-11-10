import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { flattenValidationErrors } from '../src/common/validation/flatten-validation-errors';
import { Publication } from '../src/publications/publication.entity';
import { PublicationMatchingService } from '../src/publications/matching/publication-matching.service';
import { PublicationsService } from '../src/publications/publications.service';
import { PublicationsReadController } from '../src/publications/publications-read.controller';

const LOST_SPORTS_ID = '11111111-1111-4111-8111-111111111111';
const FOUND_KEYS_ID = '22222222-2222-4222-8222-222222222222';
const LOST_BAGS_ID = '33333333-3333-4333-8333-333333333333';
const FOUND_SPORTS_ID = '44444444-4444-4444-8444-444444444444';
const RESERVED_ID = '55555555-5555-4555-8555-555555555555';

function buildPublication(overrides: Partial<Publication>): Publication {
  return {
    id: '00000000-0000-4000-8000-000000000000',
    type: 'LOST',
    status: 'ACTIVE',
    ownerId: '00000000-0000-4000-8000-000000000001',
    title: 'Publicación',
    description: 'Descripción de la publicación.',
    category: 'OTHER',
    location: 'Ubicación',
    eventDate: '2024-05-10',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    updatedAt: new Date('2026-11-05T10:00:00.000Z'),
    searchText: 'publicación descripción de la publicación ubicación',
    ...overrides,
  };
}

const PUBLICATIONS: Publication[] = [
  buildPublication({
    id: LOST_SPORTS_ID,
    type: 'LOST',
    category: 'SPORTS',
    title: 'Bicicleta rodado 29',
    description: 'Bicicleta azul con canasto negro.',
    location: 'Plaza San Martín',
    eventDate: '2024-05-10',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
  }),
  buildPublication({
    id: FOUND_KEYS_ID,
    type: 'FOUND',
    category: 'KEYS',
    title: 'Llaves con llavero rojo',
    description: 'Llaves encontradas junto a la fuente.',
    location: 'Biblioteca central',
    eventDate: '2024-11-12',
    createdAt: new Date('2026-11-05T11:00:00.000Z'),
  }),
  buildPublication({
    id: LOST_BAGS_ID,
    type: 'LOST',
    category: 'BAGS',
    title: 'Mochila gris de gimnasio',
    description: 'Mochila con toalla azul.',
    location: 'Vestuario del club',
    eventDate: '2024-01-15',
    createdAt: new Date('2026-11-05T12:00:00.000Z'),
  }),
  buildPublication({
    id: FOUND_SPORTS_ID,
    type: 'FOUND',
    category: 'SPORTS',
    title: 'Bicicleta encontrada en plaza',
    description: 'Bicicleta roja sin canasto.',
    location: 'Plaza central',
    eventDate: '2023-12-01',
    createdAt: new Date('2026-11-05T13:00:00.000Z'),
  }),
  buildPublication({
    id: RESERVED_ID,
    status: 'RESERVED',
    category: 'SPORTS',
    title: 'Bicicleta reservada',
    description: 'No debe aparecer en la lectura pública.',
    location: 'Depósito',
    eventDate: '2024-06-01',
    createdAt: new Date('2026-11-05T14:00:00.000Z'),
  }),
];

interface QueryParameters {
  status?: string;
  type?: Publication['type'];
  category?: Publication['category'];
  eventDateFrom?: string;
  eventDateTo?: string;
  like?: string;
  term?: string;
}

interface Ordering {
  column: string;
  direction: 'ASC' | 'DESC';
}

interface QueryBuilderState {
  status: string;
  type?: Publication['type'];
  category?: Publication['category'];
  eventDateFrom?: string;
  eventDateTo?: string;
  like?: string;
  relevanceTerm?: string;
  order: Ordering;
  tieBreakers: Ordering[];
  skip: number;
  take: number;
}

interface QueryBuilderMock {
  where: jest.Mock;
  andWhere: jest.Mock;
  addSelect: jest.Mock;
  setParameter: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

function likeToNeedle(like: string): string {
  return like
    .slice(1, -1)
    .replace(/\\([\\%_])/g, '$1')
    .toLowerCase();
}

function trigrams(value: string): Set<string> {
  const normalized = `  ${value.toLowerCase()} `;
  const result = new Set<string>();

  for (let index = 0; index <= normalized.length - 3; index += 1) {
    result.add(normalized.slice(index, index + 3));
  }

  return result;
}

function similarity(left: string, right: string): number {
  const leftTrigrams = trigrams(left);
  const rightTrigrams = trigrams(right);

  if (leftTrigrams.size === 0 || rightTrigrams.size === 0) {
    return 0;
  }

  let shared = 0;

  for (const trigram of leftTrigrams) {
    if (rightTrigrams.has(trigram)) {
      shared += 1;
    }
  }

  return (2 * shared) / (leftTrigrams.size + rightTrigrams.size);
}

function relevanceScore(publication: Publication, term: string): number {
  return Math.max(
    similarity(publication.title, term),
    similarity(publication.description, term),
    similarity(publication.location, term),
  );
}

function recentFirst(left: Publication, right: Publication): number {
  const byDate = right.createdAt.getTime() - left.createdAt.getTime();

  return byDate !== 0 ? byDate : right.id.localeCompare(left.id);
}

function idOrder(rows: Publication[]): string[] {
  return rows.map((publication) => publication.id);
}

function createQueryBuilderMock(rows: Publication[]): QueryBuilderMock {
  const state: QueryBuilderState = {
    status: '',
    order: { column: 'publication.createdAt', direction: 'DESC' },
    tieBreakers: [],
    skip: 0,
    take: 12,
  };

  const queryBuilder: QueryBuilderMock = {
    where: jest.fn((_sql: string, parameters: QueryParameters) => {
      state.status = parameters.status ?? '';
      return queryBuilder;
    }),
    andWhere: jest.fn((sql: string, parameters: QueryParameters) => {
      if (sql.includes('publication.type = :type')) {
        state.type = parameters.type;
      } else if (sql.includes('publication.category = :category')) {
        state.category = parameters.category;
      } else if (sql.includes('publication.eventDate >= :eventDateFrom')) {
        state.eventDateFrom = parameters.eventDateFrom;
      } else if (sql.includes('publication.eventDate <= :eventDateTo')) {
        state.eventDateTo = parameters.eventDateTo;
      } else if (sql.includes('ILIKE')) {
        state.like = parameters.like;
      }

      return queryBuilder;
    }),
    addSelect: jest.fn(() => queryBuilder),
    setParameter: jest.fn((name: string, value: string) => {
      if (name === 'relevanceTerm') {
        state.relevanceTerm = value;
      }

      return queryBuilder;
    }),
    orderBy: jest.fn((column: string, direction: 'ASC' | 'DESC') => {
      state.order = { column, direction };
      state.tieBreakers = [];
      return queryBuilder;
    }),
    addOrderBy: jest.fn((column: string, direction: 'ASC' | 'DESC') => {
      state.tieBreakers.push({ column, direction });
      return queryBuilder;
    }),
    skip: jest.fn((offset: number) => {
      state.skip = offset;
      return queryBuilder;
    }),
    take: jest.fn((limit: number) => {
      state.take = limit;
      return queryBuilder;
    }),
    getManyAndCount: jest.fn(async () => {
      let filtered = rows.filter(
        (publication) => publication.status === state.status,
      );

      if (state.type) {
        filtered = filtered.filter(
          (publication) => publication.type === state.type,
        );
      }

      if (state.category) {
        filtered = filtered.filter(
          (publication) => publication.category === state.category,
        );
      }

      if (state.eventDateFrom) {
        filtered = filtered.filter(
          (publication) => publication.eventDate >= state.eventDateFrom!,
        );
      }

      if (state.eventDateTo) {
        filtered = filtered.filter(
          (publication) => publication.eventDate <= state.eventDateTo!,
        );
      }

      if (state.like) {
        const needle = likeToNeedle(state.like);

        filtered = filtered.filter((publication) =>
          [
            publication.title,
            publication.description,
            publication.location,
          ].some((field) => field.toLowerCase().includes(needle)),
        );
      }

      const sorted = [...filtered];

      if (state.order.column === 'relevance_score') {
        const term = state.relevanceTerm ?? '';

        sorted.sort((left, right) => {
          const byScore =
            relevanceScore(right, term) - relevanceScore(left, term);

          return byScore !== 0 ? byScore : recentFirst(left, right);
        });
      } else {
        const factor = state.order.direction === 'ASC' ? 1 : -1;

        sorted.sort((left, right) => {
          const byDate =
            factor * (left.createdAt.getTime() - right.createdAt.getTime());

          return byDate !== 0 ? byDate : factor * left.id.localeCompare(right.id);
        });
      }

      return [
        sorted.slice(state.skip, state.skip + state.take),
        sorted.length,
      ];
    }),
  };

  return queryBuilder;
}

describe('Publication filters and sorting (e2e, no database)', () => {
  let app: INestApplication<App>;
  let manager: {
    transaction: jest.Mock;
    query: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let lastQueryBuilder: QueryBuilderMock | undefined;

  beforeAll(async () => {
    manager = {
      query: jest.fn(async () => [{ set_config: '0.15' }]),
      createQueryBuilder: jest.fn(() => {
        lastQueryBuilder = createQueryBuilderMock(PUBLICATIONS);
        return lastQueryBuilder;
      }),
      transaction: jest.fn(),
    };
    manager.transaction.mockImplementation(
      async (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );

    const publicationsRepository = {
      findOne: jest.fn(async () => null),
      manager,
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PublicationsReadController],
      providers: [
        PublicationsService,
        {
          provide: PublicationMatchingService,
          useValue: { generateForPublication: jest.fn(async () => []) },
        },
        {
          provide: getRepositoryToken(Publication),
          useValue: publicationsRepository,
        },
        {
          provide: APP_PIPE,
          useValue: new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
            exceptionFactory: (errors) =>
              new BadRequestException({
                statusCode: 400,
                code: 'VALIDATION_ERROR',
                message: 'Invalid request data',
                details: flattenValidationErrors(errors),
              }),
          }),
        },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    manager.transaction.mockImplementation(
      async (callback: (transactionManager: typeof manager) => unknown) =>
        callback(manager),
    );
    lastQueryBuilder = undefined;
  });

  it('filters by type=LOST and excludes non-ACTIVE rows', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ type: 'LOST' })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(idOrder(response.body.items)).toEqual([LOST_BAGS_ID, LOST_SPORTS_ID]);
    expect(idOrder(response.body.items)).not.toContain(RESERVED_ID);
    expect(lastQueryBuilder?.andWhere).toHaveBeenCalledWith(
      'publication.type = :type',
      { type: 'LOST' },
    );
  });

  it('filters by type=FOUND', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ type: 'FOUND' })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(idOrder(response.body.items)).toEqual([
      FOUND_SPORTS_ID,
      FOUND_KEYS_ID,
    ]);
  });

  it('filters by category', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ category: 'KEYS' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(FOUND_KEYS_ID);
  });

  it('filters by eventDateFrom inclusively', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ eventDateFrom: '2024-06-01' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(FOUND_KEYS_ID);
  });

  it('filters by eventDateTo inclusively', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ eventDateTo: '2024-01-31' })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(idOrder(response.body.items)).toEqual([FOUND_SPORTS_ID, LOST_BAGS_ID]);
  });

  it('includes both exact date boundaries', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({
        eventDateFrom: '2024-05-10',
        eventDateTo: '2024-11-12',
      })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(idOrder(response.body.items)).toEqual([FOUND_KEYS_ID, LOST_SPORTS_ID]);
  });

  it('combines filters with AND', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({
        type: 'LOST',
        category: 'SPORTS',
        eventDateFrom: '2024-01-01',
        eventDateTo: '2024-12-31',
      })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(LOST_SPORTS_ID);
  });

  it('combines filters with the CU3 text search', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'bicicleta', type: 'FOUND' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items[0].id).toBe(FOUND_SPORTS_ID);
  });

  it('sorts recent first by default', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .expect(200);

    expect(idOrder(response.body.items)).toEqual([
      FOUND_SPORTS_ID,
      LOST_BAGS_ID,
      FOUND_KEYS_ID,
      LOST_SPORTS_ID,
    ]);
    expect(idOrder(response.body.items)).not.toContain(RESERVED_ID);
  });

  it('sorts oldest first with sort=oldest', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ sort: 'oldest' })
      .expect(200);

    expect(idOrder(response.body.items)).toEqual([
      LOST_SPORTS_ID,
      FOUND_KEYS_ID,
      LOST_BAGS_ID,
      FOUND_SPORTS_ID,
    ]);
  });

  it('sorts by trigram relevance and resolves ties by recency', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'bicicleta', sort: 'relevance' })
      .expect(200);

    expect(idOrder(response.body.items)).toEqual([
      LOST_SPORTS_ID,
      FOUND_SPORTS_ID,
    ]);
    expect(lastQueryBuilder?.addSelect).toHaveBeenCalledWith(
      expect.stringContaining('GREATEST'),
      'relevance_score',
    );
    expect(lastQueryBuilder?.orderBy).toHaveBeenCalledWith(
      'relevance_score',
      'DESC',
    );
    expect(lastQueryBuilder?.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'publication.createdAt',
      'DESC',
    );
    expect(lastQueryBuilder?.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'publication.id',
      'DESC',
    );
  });

  it('paginates the filtered result set', async () => {
    const firstPage = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ type: 'LOST', page: 1, pageSize: 1 })
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ type: 'LOST', page: 2, pageSize: 1 })
      .expect(200);

    expect(firstPage.body).toMatchObject({
      page: 1,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(secondPage.body).toMatchObject({
      page: 2,
      pageSize: 1,
      total: 2,
      totalPages: 2,
    });
    expect(firstPage.body.items[0].id).toBe(LOST_BAGS_ID);
    expect(secondPage.body.items[0].id).toBe(LOST_SPORTS_ID);
  });

  it.each([
    { query: { type: 'RESERVED' }, field: 'type' },
    { query: { type: 'RETURNED' }, field: 'type' },
    { query: { category: 'VEHICLES' }, field: 'category' },
    { query: { eventDateFrom: '2024-02-30' }, field: 'eventDateFrom' },
    { query: { eventDateTo: '2024-13-01' }, field: 'eventDateTo' },
    { query: { sort: 'createdAt' }, field: 'sort' },
    { query: { ownerId: 'unknown' }, field: 'ownerId' },
    { query: { status: 'RESERVED' }, field: 'status' },
  ])(
    'rejects an invalid or unknown $field query parameter with 400',
    async ({ query, field }) => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/publications')
        .query(query)
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
      });
      expect(response.body.details).toEqual(
        expect.arrayContaining([expect.objectContaining({ field })]),
      );
    },
  );

  it('rejects relevance without a search term', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ sort: 'relevance' })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [
        {
          field: 'sort',
          message: 'El orden por relevancia requiere un término de búsqueda.',
        },
      ],
    });
    expect(manager.transaction).not.toHaveBeenCalled();
  });

  it('rejects an inverted event date range', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({
        eventDateFrom: '2024-12-31',
        eventDateTo: '2024-01-01',
      })
      .expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [
        {
          field: 'eventDateTo',
          message: 'La fecha final no puede ser anterior a la fecha inicial.',
        },
      ],
    });
    expect(manager.transaction).not.toHaveBeenCalled();
  });
});
