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
import { DemoIdentityGuard } from '../src/identity/demo-identity.guard';
import { DemoIdentityResolver } from '../src/identity/demo-identity.resolver';
import { CURRENT_USER_RESOLVER } from '../src/identity/identity.types';
import { User } from '../src/identity/user.entity';
import { FoundPublicationsController } from '../src/publications/found-publications.controller';
import { PublicationMatchingService } from '../src/publications/matching/publication-matching.service';
import { Publication } from '../src/publications/publication.entity';
import { PublicationsService } from '../src/publications/publications.service';

const DEMO_USER_ID = '00000000-0000-4000-8000-000000000001';
const UNKNOWN_USER_ID = '00000000-0000-4000-8000-0000000000ff';

const VALID_BODY = {
  title: 'Llaves con llavero de equipo',
  description: 'Llavero de metal con escudo y tres llaves pequeñas.',
  category: 'KEYS',
  location: 'Biblioteca central, mostrador de atención',
  eventDate: '2024-11-12',
};

describe('Found publications (e2e, no database)', () => {
  let app: INestApplication<App>;
  let publicationsRepository: {
    create: jest.Mock;
    save: jest.Mock;
    manager: {
      transaction: jest.Mock;
      create: jest.Mock;
      save: jest.Mock;
      findOne: jest.Mock;
    };
  };

  beforeAll(async () => {
    let persistedPublication: Partial<Publication> | undefined;
    publicationsRepository = {
      create: jest.fn((input: Partial<Publication>) => ({ ...input })),
      save: jest.fn(async (entity: Partial<Publication>) => {
        persistedPublication = {
          ...entity,
          createdAt: new Date('2026-11-05T10:00:00.000Z'),
          updatedAt: new Date('2026-11-05T10:00:00.000Z'),
          searchText: `${entity.title} ${entity.description} ${entity.location}`.toLowerCase(),
        };
        return persistedPublication;
      }),
      manager: undefined as never,
    };
    const manager = {
      transaction: jest.fn(
        async (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
      create: jest.fn((_entity: typeof Publication, input: Partial<Publication>) =>
        publicationsRepository.create(input),
      ),
      save: jest.fn((_entity: typeof Publication, entity: Partial<Publication>) =>
        publicationsRepository.save(entity),
      ),
      findOne: jest.fn(async () => persistedPublication as Publication),
    };
    publicationsRepository.manager = manager;
    const publicationMatching = {
      generateForPublication: jest.fn(async () => []),
    };

    const usersRepository = {
      findOne: jest.fn(
        async ({ where }: { where: { id: string } }) =>
          where.id === DEMO_USER_ID
            ? { id: DEMO_USER_ID, role: 'USER' }
            : null,
      ),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [FoundPublicationsController],
      providers: [
        PublicationsService,
        {
          provide: PublicationMatchingService,
          useValue: publicationMatching,
        },
        DemoIdentityResolver,
        DemoIdentityGuard,
        { provide: CURRENT_USER_RESOLVER, useExisting: DemoIdentityResolver },
        { provide: getRepositoryToken(User), useValue: usersRepository },
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
  });

  it('POST /api/v1/found-publications creates a FOUND publication for the demo user', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/found-publications')
      .set('X-Demo-User-Id', DEMO_USER_ID)
      .send(VALID_BODY)
      .expect(201);

    expect(response.body).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'FOUND',
      status: 'ACTIVE',
      ownerId: DEMO_USER_ID,
      title: VALID_BODY.title,
      description: VALID_BODY.description,
      category: VALID_BODY.category,
      location: VALID_BODY.location,
      eventDate: VALID_BODY.eventDate,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    });
    expect(publicationsRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FOUND',
        status: 'ACTIVE',
        ownerId: DEMO_USER_ID,
      }),
    );
    expect(publicationsRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'FOUND',
        status: 'ACTIVE',
        ownerId: DEMO_USER_ID,
      }),
    );
  });

  it('POST with spoofed type, status and ownerId returns 400 VALIDATION_ERROR and never persists them', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/found-publications')
      .set('X-Demo-User-Id', DEMO_USER_ID)
      .send({
        ...VALID_BODY,
        type: 'LOST',
        status: 'CLOSED',
        ownerId: UNKNOWN_USER_ID,
      })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'type' }),
        expect.objectContaining({ field: 'status' }),
        expect.objectContaining({ field: 'ownerId' }),
      ]),
    );
    expect(publicationsRepository.create).not.toHaveBeenCalled();
    expect(publicationsRepository.save).not.toHaveBeenCalled();
  });

  it('POST with invalid data returns 400 with field details', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/found-publications')
      .set('X-Demo-User-Id', DEMO_USER_ID)
      .send({ ...VALID_BODY, title: 'ab' })
      .expect(400);

    expect(response.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
    });
    expect(response.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'title' })]),
    );
    expect(publicationsRepository.create).not.toHaveBeenCalled();
    expect(publicationsRepository.save).not.toHaveBeenCalled();
  });

  it('POST without X-Demo-User-Id returns 401 DEMO_IDENTITY_REQUIRED', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/found-publications')
      .send(VALID_BODY)
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_REQUIRED',
      message: expect.any(String),
    });
    expect(publicationsRepository.create).not.toHaveBeenCalled();
    expect(publicationsRepository.save).not.toHaveBeenCalled();
  });

  it('POST with an unknown demo user returns 401 DEMO_IDENTITY_INVALID', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/found-publications')
      .set('X-Demo-User-Id', UNKNOWN_USER_ID)
      .send(VALID_BODY)
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_INVALID',
    });
    expect(publicationsRepository.create).not.toHaveBeenCalled();
    expect(publicationsRepository.save).not.toHaveBeenCalled();
  });
});
