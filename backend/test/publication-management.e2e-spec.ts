import {
  BadRequestException,
  ForbiddenException,
  INestApplication,
  UnauthorizedException,
  ValidationPipe,
} from '@nestjs/common';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { flattenValidationErrors } from '../src/common/validation/flatten-validation-errors';
import { DemoIdentityGuard } from '../src/identity/demo-identity.guard';
import { CURRENT_USER_RESOLVER } from '../src/identity/identity.types';
import { AdminPublicationsController } from '../src/publications/admin-publications.controller';
import { OwnPublicationsController } from '../src/publications/own-publications.controller';
import type { OwnPublicationResponse } from '../src/publications/publication-own-response';
import { PublicationsReadController } from '../src/publications/publications-read.controller';
import { PublicationsService } from '../src/publications/publications.service';

const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

const RESPONSE: OwnPublicationResponse = {
  id: PUBLICATION_ID,
  type: 'FOUND',
  status: 'ACTIVE',
  title: 'Mochila negra',
  description: 'Mochila negra con una marca azul.',
  category: 'BAGS',
  location: 'Plaza Central',
  eventDate: '2026-11-01',
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

const UPDATE_BODY = {
  title: 'Mochila negra actualizada',
  description: 'Mochila negra con una marca azul y una etiqueta nueva.',
  category: 'BAGS',
  location: 'Plaza Central, banco 3',
  eventDate: '2026-11-02',
};

describe('Publication management (e2e, mocked service)', () => {
  let app: INestApplication<App>;
  let service: {
    findMine: jest.Mock;
    findMineById: jest.Mock;
    updateOwnPublication: jest.Mock;
    closePublication: jest.Mock;
    findActivePublicationsForAdmin: jest.Mock;
    searchActivePublications: jest.Mock;
    findActivePublicationById: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      findMine: jest.fn(async () => [RESPONSE, { ...RESPONSE, status: 'CLOSED' }]),
      findMineById: jest.fn(async () => ({ ...RESPONSE, status: 'RETURNED' })),
      updateOwnPublication: jest.fn(async () => ({
        ...RESPONSE,
        ...UPDATE_BODY,
      })),
      closePublication: jest.fn(async () => ({
        ...RESPONSE,
        status: 'CLOSED',
      })),
      findActivePublicationsForAdmin: jest.fn(async () => [RESPONSE]),
      searchActivePublications: jest.fn(async () => ({
        items: [],
        page: 1,
        pageSize: 12,
        total: 0,
        totalPages: 0,
      })),
      findActivePublicationById: jest.fn(async () => ({
        ...RESPONSE,
        status: 'ACTIVE',
      })),
    };
    const resolver = {
      resolve: jest.fn(async (incoming: { header(name: string): string }) => {
        const header = incoming.header('x-demo-user-id');

        if (!header) {
          throw new UnauthorizedException({
            statusCode: 401,
            code: 'DEMO_IDENTITY_REQUIRED',
            message: 'X-Demo-User-Id header is required while AUTH_MODE=demo',
          });
        }

        if (header === 'invalid') {
          throw new UnauthorizedException({
            statusCode: 401,
            code: 'DEMO_IDENTITY_INVALID',
            message:
              'X-Demo-User-Id does not identify an existing demo user',
          });
        }

        return {
          id: header,
          role: header === ADMIN_ID ? 'ADMIN' : 'USER',
        };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [
        OwnPublicationsController,
        AdminPublicationsController,
        PublicationsReadController,
      ],
      providers: [
        DemoIdentityGuard,
        { provide: PublicationsService, useValue: service },
        { provide: CURRENT_USER_RESOLVER, useValue: resolver },
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

  it('lists own publications without ownerId for USER and ADMIN', async () => {
    const user = await request(app.getHttpServer())
      .get('/api/v1/publications/mine')
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);
    const admin = await request(app.getHttpServer())
      .get('/api/v1/publications/mine')
      .set('X-Demo-User-Id', ADMIN_ID)
      .expect(200);

    expect(user.body).toEqual([RESPONSE, { ...RESPONSE, status: 'CLOSED' }]);
    expect(admin.body).toEqual([RESPONSE, { ...RESPONSE, status: 'CLOSED' }]);
    expect(service.findMine).toHaveBeenNthCalledWith(1, USER_ID);
    expect(service.findMine).toHaveBeenNthCalledWith(2, ADMIN_ID);
    expect(JSON.stringify(user.body)).not.toContain('ownerId');
  });

  it('returns an own detail in any state without ownerId', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/mine/${PUBLICATION_ID}`)
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);

    expect(response.body).toEqual({ ...RESPONSE, status: 'RETURNED' });
    expect(service.findMineById).toHaveBeenCalledWith(PUBLICATION_ID, USER_ID);
    expect(response.body).not.toHaveProperty('ownerId');
  });

  it('updates an own active publication', async () => {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/publications/${PUBLICATION_ID}`)
      .set('X-Demo-User-Id', USER_ID)
      .send(UPDATE_BODY)
      .expect(200);

    expect(response.body).toMatchObject({
      id: PUBLICATION_ID,
      title: UPDATE_BODY.title,
      status: 'ACTIVE',
    });
    expect(service.updateOwnPublication).toHaveBeenCalledWith(
      PUBLICATION_ID,
      UPDATE_BODY,
      USER_ID,
    );
    expect(response.body).not.toHaveProperty('ownerId');
  });

  it('closes an own active publication', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/publications/${PUBLICATION_ID}/close`)
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);

    expect(response.body).toMatchObject({
      id: PUBLICATION_ID,
      status: 'CLOSED',
    });
    expect(service.closePublication).toHaveBeenCalledWith(PUBLICATION_ID, {
      id: USER_ID,
      role: 'USER',
    });
  });

  it('lists only the admin moderation response without ownerId', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/publications')
      .set('X-Demo-User-Id', ADMIN_ID)
      .expect(200);

    expect(response.body).toEqual([RESPONSE]);
    expect(service.findActivePublicationsForAdmin).toHaveBeenCalledWith({
      id: ADMIN_ID,
      role: 'ADMIN',
    });
    expect(response.body[0]).not.toHaveProperty('ownerId');
  });

  it('returns 403 when a USER requests the global moderation list', async () => {
    service.findActivePublicationsForAdmin.mockRejectedValueOnce(
      new ForbiddenException({
        statusCode: 403,
        code: 'ADMIN_FORBIDDEN',
        message: 'The authenticated user is not an administrator',
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/api/v1/admin/publications')
      .set('X-Demo-User-Id', USER_ID)
      .expect(403);

    expect(response.body).toMatchObject({
      statusCode: 403,
      code: 'ADMIN_FORBIDDEN',
    });
  });

  it('protects all management routes with the demo identity', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/publications/mine')
      .expect(401);
    await request(app.getHttpServer())
      .get(`/api/v1/publications/mine/${PUBLICATION_ID}`)
      .expect(401);
    await request(app.getHttpServer())
      .put(`/api/v1/publications/${PUBLICATION_ID}`)
      .send(UPDATE_BODY)
      .expect(401);
    await request(app.getHttpServer())
      .post(`/api/v1/publications/${PUBLICATION_ID}/close`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/admin/publications')
      .expect(401);
  });

  it('rejects protected fields and invalid identifiers', async () => {
    const protectedField = await request(app.getHttpServer())
      .put(`/api/v1/publications/${PUBLICATION_ID}`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ ...UPDATE_BODY, ownerId: USER_ID })
      .expect(400);

    expect(protectedField.body.code).toBe('VALIDATION_ERROR');
    expect(protectedField.body.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'ownerId' }),
      ]),
    );

    await request(app.getHttpServer())
      .get('/api/v1/publications/mine/not-a-uuid')
      .set('X-Demo-User-Id', USER_ID)
      .expect(400);
  });

  it('keeps the public detail route separate from /mine', async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/publications/${PUBLICATION_ID}`)
      .expect(200);

    expect(response.body).toMatchObject({ id: PUBLICATION_ID, status: 'ACTIVE' });
    expect(service.findActivePublicationById).toHaveBeenCalledWith(
      PUBLICATION_ID,
    );
  });
});
