import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { flattenValidationErrors } from '../src/common/validation/flatten-validation-errors';
import { DEFAULT_MATCHING_CONFIG } from '../src/config/env.validation';
import { PublicationMatch } from '../src/publications/matching/publication-match.entity';
import { PublicationMatchingService } from '../src/publications/matching/publication-matching.service';
import { Publication } from '../src/publications/publication.entity';
import { PublicationMatchesController } from '../src/publications/matching/publication-matches.controller';

const SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';
const MISSING_ID = '99999999-9999-4999-8999-999999999999';

function buildPublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: SOURCE_ID,
    type: 'LOST',
    status: 'ACTIVE',
    ownerId: '00000000-0000-4000-8000-000000000001',
    title: 'Billetera negra',
    description: 'Billetera de cuero con tarjetas.',
    category: 'BAGS',
    location: 'Plaza Central',
    eventDate: '2026-11-01',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:00:00.000Z'),
    searchText: 'billetera negra billetera de cuero con tarjetas plaza central',
    ...overrides,
  };
}

function buildRawMatch(overrides: Record<string, unknown> = {}) {
  return {
    match_id: '33333333-3333-4333-8333-333333333333',
    match_status: 'SUGGESTED',
    match_score: '0.8350',
    candidate_id: CANDIDATE_ID,
    candidate_type: 'FOUND',
    candidate_status: 'ACTIVE',
    candidate_title: 'Billetera negra encontrada',
    candidate_description: 'Billetera de cuero con tarjetas encontradas.',
    candidate_category: 'BAGS',
    candidate_location: 'Plaza Central',
    candidate_event_date: '2026-11-01',
    candidate_created_at: '2026-11-06T10:00:00.000Z',
    match_text_score: '0.8',
    match_location_score: '0.6',
    match_date_difference_days: '1',
    ...overrides,
  };
}

describe('Publication matching (e2e, mocked repositories)', () => {
  let app: INestApplication<App>;
  let queryBuilder: {
    innerJoin: jest.Mock;
    select: jest.Mock;
    addSelect: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    setParameters: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    getRawMany: jest.Mock;
  };
  let source: Publication;
  let publicationsRepository: { findOne: jest.Mock };

  beforeEach(async () => {
    source = buildPublication();
    queryBuilder = {
      innerJoin: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => [buildRawMatch()]),
    };
    publicationsRepository = {
      findOne: jest.fn(async ({ where }: { where: { id: string; status: string } }) =>
        where.id === source.id && where.status === 'ACTIVE' ? source : null,
      ),
    };
    const matchesRepository = {
      createQueryBuilder: jest.fn(() => queryBuilder),
    };
    const configService = {
      getOrThrow: jest.fn(() => DEFAULT_MATCHING_CONFIG),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [PublicationMatchesController],
      providers: [
        PublicationMatchingService,
        {
          provide: getRepositoryToken(Publication),
          useValue: publicationsRepository,
        },
        {
          provide: getRepositoryToken(PublicationMatch),
          useValue: matchesRepository,
        },
        { provide: ConfigService, useValue: configService },
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

  afterEach(async () => {
    await app.close();
  });

  it('returns public matches with score breakdown for a LOST source', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${SOURCE_ID}/matches`)
      .expect(200);

    expect(response.body).toEqual({
      publicationId: SOURCE_ID,
      items: [
        {
          id: '33333333-3333-4333-8333-333333333333',
          status: 'SUGGESTED',
          candidate: {
            id: CANDIDATE_ID,
            type: 'FOUND',
            status: 'ACTIVE',
            title: 'Billetera negra encontrada',
            description: 'Billetera de cuero con tarjetas encontradas.',
            category: 'BAGS',
            location: 'Plaza Central',
            eventDate: '2026-11-01',
            createdAt: '2026-11-06T10:00:00.000Z',
          },
          score: 0.835,
          scoreBreakdown: {
            text: { score: 0.8, weight: 0.5, contribution: 0.4 },
            category: { score: 1, weight: 0.2, contribution: 0.2 },
            date: { score: 29 / 30, weight: 0.15, contribution: (29 / 30) * 0.15 },
            location: { score: 0.6, weight: 0.15, contribution: 0.09 },
          },
          eventDateDifferenceDays: 1,
        },
      ],
    });
    expect(response.body.items[0].candidate).not.toHaveProperty('ownerId');
    expect(publicationsRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ ownerId: true }),
        where: { id: SOURCE_ID, status: 'ACTIVE' },
      }),
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'lostPublication.status = :activeStatus',
      { activeStatus: 'ACTIVE' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'foundPublication.status = :activeStatus',
      { activeStatus: 'ACTIVE' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.type = :oppositeType',
      { oppositeType: 'FOUND' },
    );
  });

  it('returns LOST candidates for a FOUND source', async () => {
    source = buildPublication({ id: CANDIDATE_ID, type: 'FOUND' });
    queryBuilder.getRawMany.mockResolvedValueOnce([
      buildRawMatch({
        candidate_id: SOURCE_ID,
        candidate_type: 'LOST',
        match_score: '0.8400',
        match_date_difference_days: '0',
      }),
    ]);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${CANDIDATE_ID}/matches`)
      .expect(200);

    expect(response.body.items[0].candidate.id).toBe(SOURCE_ID);
    expect(response.body.items[0].candidate.type).toBe('LOST');
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'match.foundPublicationId = :sourceId',
      { sourceId: CANDIDATE_ID },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.type = :oppositeType',
      { oppositeType: 'LOST' },
    );
  });

  it('returns an empty list when there are no stored suggestions', async () => {
    queryBuilder.getRawMany.mockResolvedValueOnce([]);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${SOURCE_ID}/matches`)
      .expect(200);

    expect(response.body).toEqual({ publicationId: SOURCE_ID, items: [] });
  });

  it('returns the same not found response for missing and inactive sources', async () => {
    publicationsRepository.findOne.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${MISSING_ID}/matches`)
      .expect(404);

    expect(response.body).toEqual({
      statusCode: 404,
      code: 'PUBLICATION_NOT_FOUND',
      message: 'Publication not found',
    });
    expect(queryBuilder.getRawMany).not.toHaveBeenCalled();
  });

  it('rejects an invalid source UUID with VALIDATION_ERROR', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/publications/not-a-uuid/matches')
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'id' })]),
    );
  });
});
