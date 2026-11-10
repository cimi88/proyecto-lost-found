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

const ACTIVE_LOST_ID = '11111111-1111-4111-8111-111111111111';
const ACTIVE_FOUND_ID = '22222222-2222-4222-8222-222222222222';
const RESERVED_ID = '33333333-3333-4333-8333-333333333333';
const RETURNED_ID = '44444444-4444-4444-8444-444444444444';
const CLOSED_ID = '55555555-5555-4555-8555-555555555555';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

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
    id: ACTIVE_LOST_ID,
    type: 'LOST',
    status: 'ACTIVE',
    title: 'Bicicleta rodado 29',
    description: 'Bicicleta azul con canasto negro y una calcomanía.',
    category: 'SPORTS',
    location: 'Plaza San Martín',
    eventDate: '2024-05-10',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:00:00.000Z'),
  }),
  buildPublication({
    id: ACTIVE_FOUND_ID,
    type: 'FOUND',
    status: 'ACTIVE',
    title: 'Llaves con llavero de equipo',
    description: 'Llavero de metal con escudo y tres llaves pequeñas.',
    category: 'KEYS',
    location: 'Biblioteca central, mostrador de atención',
    eventDate: '2024-11-12',
    createdAt: new Date('2026-11-05T11:00:00.000Z'),
    updatedAt: new Date('2026-11-06T11:00:00.000Z'),
  }),
  buildPublication({
    id: RESERVED_ID,
    status: 'RESERVED',
    title: 'Bicicleta reservada',
    createdAt: new Date('2026-11-05T12:00:00.000Z'),
  }),
  buildPublication({
    id: RETURNED_ID,
    status: 'RETURNED',
    title: 'Bicicleta devuelta',
    createdAt: new Date('2026-11-05T13:00:00.000Z'),
  }),
  buildPublication({
    id: CLOSED_ID,
    status: 'CLOSED',
    title: 'Bicicleta cerrada',
    createdAt: new Date('2026-11-05T14:00:00.000Z'),
  }),
];

interface QueryBuilderState {
  status: string;
  like: string | null;
  skip: number;
  take: number;
}

interface QueryBuilderMock {
  where: jest.Mock;
  andWhere: jest.Mock;
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

function createQueryBuilderMock(rows: Publication[]): QueryBuilderMock {
  const state: QueryBuilderState = {
    status: '',
    like: null,
    skip: 0,
    take: 12,
  };

  const queryBuilder: QueryBuilderMock = {
    where: jest.fn((_sql: string, parameters: { status: string }) => {
      state.status = parameters.status;
      return queryBuilder;
    }),
    andWhere: jest.fn((_sql: string, parameters: { like?: string }) => {
      state.like = parameters.like ?? null;
      return queryBuilder;
    }),
    orderBy: jest.fn(() => queryBuilder),
    addOrderBy: jest.fn(() => queryBuilder),
    skip: jest.fn((offset: number) => {
      state.skip = offset;
      return queryBuilder;
    }),
    take: jest.fn((limit: number) => {
      state.take = limit;
      return queryBuilder;
    }),
    getManyAndCount: jest.fn(async () => {
      const active = rows.filter(
        (publication) => publication.status === state.status,
      );
      const needle = state.like === null ? null : likeToNeedle(state.like);
      const filtered =
        needle === null
          ? active
          : active.filter((publication) =>
              [
                publication.title,
                publication.description,
                publication.location,
              ].some((field) => field.toLowerCase().includes(needle)),
            );
      const sorted = [...filtered].sort((left, right) => {
        const byDate =
          right.createdAt.getTime() - left.createdAt.getTime();

        return byDate !== 0 ? byDate : right.id.localeCompare(left.id);
      });

      return [
        sorted.slice(state.skip, state.skip + state.take),
        sorted.length,
      ];
    }),
  };

  return queryBuilder;
}

describe('Publication search and detail (e2e, no database)', () => {
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
      findOne: jest.fn(
        async ({ where }: { where: { id: string; status: string } }) =>
          PUBLICATIONS.find(
            (publication) =>
              publication.id === where.id && publication.status === where.status,
          ) ?? null,
      ),
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

  it('GET /api/v1/publications lists only ACTIVE publications of both types', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .expect(200);

    expect(response.body).toMatchObject({
      page: 1,
      pageSize: 12,
      total: 2,
      totalPages: 1,
    });
    expect(response.body.items).toEqual([
      {
        id: ACTIVE_FOUND_ID,
        type: 'FOUND',
        status: 'ACTIVE',
        title: 'Llaves con llavero de equipo',
        description: 'Llavero de metal con escudo y tres llaves pequeñas.',
        category: 'KEYS',
        location: 'Biblioteca central, mostrador de atención',
        eventDate: '2024-11-12',
        createdAt: '2026-11-05T11:00:00.000Z',
      },
      {
        id: ACTIVE_LOST_ID,
        type: 'LOST',
        status: 'ACTIVE',
        title: 'Bicicleta rodado 29',
        description: 'Bicicleta azul con canasto negro y una calcomanía.',
        category: 'SPORTS',
        location: 'Plaza San Martín',
        eventDate: '2024-05-10',
        createdAt: '2026-11-05T10:00:00.000Z',
      },
    ]);
    expect(response.body.items[0]).not.toHaveProperty('ownerId');
    expect(response.body.items[0]).not.toHaveProperty('updatedAt');
    expect(
      response.body.items.map((item: { id: string }) => item.id),
    ).not.toEqual(
      expect.arrayContaining([RESERVED_ID, RETURNED_ID, CLOSED_ID]),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "set_config('pg_trgm.similarity_threshold', $1, true)",
      ),
      ['0.15'],
    );
  });

  it('GET /api/v1/publications?q= matches the title', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'bicicleta' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toEqual([
      expect.objectContaining({ id: ACTIVE_LOST_ID }),
    ]);
  });

  it('GET /api/v1/publications?q= matches the description', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'canasto' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toEqual([
      expect.objectContaining({ id: ACTIVE_LOST_ID }),
    ]);
  });

  it('GET /api/v1/publications?q= matches the location', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'biblioteca' })
      .expect(200);

    expect(response.body.total).toBe(1);
    expect(response.body.items).toEqual([
      expect.objectContaining({ id: ACTIVE_FOUND_ID }),
    ]);
  });

  it('GET /api/v1/publications?q= returns an empty page without results', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: 'helicóptero' })
      .expect(200);

    expect(response.body).toEqual({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('treats a blank q as absent and lists the active publications', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ q: '   ' })
      .expect(200);

    expect(response.body.total).toBe(2);
    expect(lastQueryBuilder?.andWhere).not.toHaveBeenCalled();
  });

  it('paginates with a stable order and no overlap', async () => {
    const firstPage = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ page: 1, pageSize: 1 })
      .expect(200);
    const secondPage = await request(app.getHttpServer())
      .get('/api/v1/publications')
      .query({ page: 2, pageSize: 1 })
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
    expect(firstPage.body.items[0].id).toBe(ACTIVE_FOUND_ID);
    expect(secondPage.body.items[0].id).toBe(ACTIVE_LOST_ID);
  });

  it('GET /api/v1/publications/:id returns an ACTIVE publication without ownerId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${ACTIVE_LOST_ID}`)
      .expect(200);

    expect(response.body).toEqual({
      id: ACTIVE_LOST_ID,
      type: 'LOST',
      status: 'ACTIVE',
      title: 'Bicicleta rodado 29',
      description: 'Bicicleta azul con canasto negro y una calcomanía.',
      category: 'SPORTS',
      location: 'Plaza San Martín',
      eventDate: '2024-05-10',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-06T10:00:00.000Z',
    });
    expect(response.body).not.toHaveProperty('ownerId');
    expect(response.body).not.toHaveProperty('user');
    expect(response.body).not.toHaveProperty('contact');
  });

  it.each([
    { label: 'RESERVED', id: RESERVED_ID },
    { label: 'RETURNED', id: RETURNED_ID },
    { label: 'CLOSED', id: CLOSED_ID },
    { label: 'nonexistent', id: MISSING_ID },
  ])(
    'GET /api/v1/publications/:id returns 404 for a $label publication',
    async ({ id }) => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/publications/${id}`)
        .expect(404);

      expect(response.body).toEqual({
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication not found',
      });
    },
  );

  it.each([
    { query: { page: '0' }, field: 'page' },
    { query: { pageSize: '51' }, field: 'pageSize' },
    { query: { q: 'x'.repeat(101) }, field: 'q' },
    { query: { ownerId: 'unknown' }, field: 'ownerId' },
  ])(
    'GET /api/v1/publications rejects $field with 400 VALIDATION_ERROR',
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

  it('GET /api/v1/publications/:id rejects an invalid UUID with 400 VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications/not-a-uuid')
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
    );
  });
});
