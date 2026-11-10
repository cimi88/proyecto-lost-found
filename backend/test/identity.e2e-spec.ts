import {
  BadRequestException,
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
import { MeController } from '../src/identity/me.controller';

const USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';
const INVALID_ID = 'invalid';

describe('Identity (e2e, mocked resolver)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
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

        if (header === INVALID_ID) {
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
      controllers: [MeController],
      providers: [
        DemoIdentityGuard,
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

  it('returns USER without exposing additional data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);

    expect(response.body).toEqual({ role: 'USER' });
    expect(JSON.stringify(response.body)).not.toContain(USER_ID);
    expect(JSON.stringify(response.body)).not.toContain('@');
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('email');
    expect(response.body).not.toHaveProperty('displayName');
  });

  it('returns ADMIN without exposing additional data', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('X-Demo-User-Id', ADMIN_ID)
      .expect(200);

    expect(response.body).toEqual({ role: 'ADMIN' });
    expect(response.body).not.toHaveProperty('id');
    expect(response.body).not.toHaveProperty('email');
  });

  it('returns DEMO_IDENTITY_REQUIRED without identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_REQUIRED',
    });
  });

  it('returns DEMO_IDENTITY_INVALID for an invalid identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('X-Demo-User-Id', INVALID_ID)
      .expect(401);

    expect(response.body).toMatchObject({
      statusCode: 401,
      code: 'DEMO_IDENTITY_INVALID',
    });
  });
});
