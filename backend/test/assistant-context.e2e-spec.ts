import {
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AssistantContextController } from '../src/assistant/assistant-context.controller';
import { DemoIdentityGuard } from '../src/identity/demo-identity.guard';
import { CURRENT_USER_RESOLVER } from '../src/identity/identity.types';

const USER_ID = '22222222-2222-4222-8222-222222222222';
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

describe('Assistant context (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const resolver = {
      resolve: jest.fn(async (incoming: { header(name: string): string }) => {
        const header = incoming.header('x-demo-user-id');

        if (!header) {
          throw new UnauthorizedException({
            statusCode: 401,
            code: 'DEMO_IDENTITY_REQUIRED',
            message: 'X-Demo-User-Id header is required',
          });
        }

        if (header === USER_ID) {
          return { id: USER_ID, role: 'USER' };
        }

        if (header === ADMIN_ID) {
          return { id: ADMIN_ID, role: 'ADMIN' };
        }

        throw new UnauthorizedException({
          statusCode: 401,
          code: 'DEMO_IDENTITY_INVALID',
          message: 'X-Demo-User-Id does not identify an existing demo user',
        });
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [AssistantContextController],
      providers: [
        DemoIdentityGuard,
        { provide: CURRENT_USER_RESOLVER, useValue: resolver },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns USER for a normal identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assistant/context')
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);

    expect(response.body).toEqual({ role: 'USER' });
  });

  it('returns ADMIN for an admin identity', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/assistant/context')
      .set('X-Demo-User-Id', ADMIN_ID)
      .expect(200);

    expect(response.body).toEqual({ role: 'ADMIN' });
  });

  it('requires a valid demo identity', async () => {
    const missing = await request(app.getHttpServer())
      .get('/api/v1/assistant/context')
      .expect(401);
    const invalid = await request(app.getHttpServer())
      .get('/api/v1/assistant/context')
      .set('X-Demo-User-Id', 'invalid')
      .expect(401);

    expect(missing.body.code).toBe('DEMO_IDENTITY_REQUIRED');
    expect(invalid.body.code).toBe('DEMO_IDENTITY_INVALID');
  });
});
