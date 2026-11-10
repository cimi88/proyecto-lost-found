import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  INestApplication,
  NotFoundException,
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
import { RecoveryRequestsController } from '../src/recovery-requests/recovery-requests.controller';
import type { RecoveryRequestResponse } from '../src/recovery-requests/recovery-request-response';
import { RecoveryRequestsService } from '../src/recovery-requests/recovery-requests.service';

const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const ADMIN_ID = '44444444-4444-4444-8444-444444444444';

const RESPONSE: RecoveryRequestResponse = {
  id: REQUEST_ID,
  status: 'PENDING',
  notes: 'Tiene una marca azul.',
  cancellationReason: null,
  completedAt: null,
  returnNotes: null,
  createdAt: '2026-11-07T10:00:00.000Z',
  updatedAt: '2026-11-07T10:00:00.000Z',
  publication: {
    id: PUBLICATION_ID,
    type: 'FOUND',
    status: 'ACTIVE',
    title: 'Mochila negra',
    description: 'Mochila negra con una marca azul.',
    category: 'BAGS',
    location: 'Plaza Central',
    eventDate: '2026-11-01',
    createdAt: '2026-11-06T10:00:00.000Z',
  },
  requesterDisplayName: 'Solicitante Demo',
};

describe('Recovery requests (e2e, mocked service)', () => {
  let app: INestApplication<App>;
  let service: {
    create: jest.Mock;
    findMine: jest.Mock;
    findReceived: jest.Mock;
    approve: jest.Mock;
    reject: jest.Mock;
    complete: jest.Mock;
    cancel: jest.Mock;
  };

  beforeEach(async () => {
    service = {
      create: jest.fn(async () => RESPONSE),
      findMine: jest.fn(async () => [RESPONSE]),
      findReceived: jest.fn(async () => [RESPONSE]),
      approve: jest.fn(async () => ({ ...RESPONSE, status: 'APPROVED' })),
      reject: jest.fn(async () => ({ ...RESPONSE, status: 'REJECTED' })),
      complete: jest.fn(async () => ({
        ...RESPONSE,
        status: 'COMPLETED',
        completedAt: '2026-11-08T10:00:00.000Z',
        returnNotes: 'Entregado.',
        publication: {
          ...RESPONSE.publication,
          status: 'RETURNED',
        },
      })),
      cancel: jest.fn(async () => ({
        ...RESPONSE,
        status: 'CANCELLED',
        cancellationReason: 'Motivo válido',
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
      controllers: [RecoveryRequestsController],
      providers: [
        DemoIdentityGuard,
        { provide: RecoveryRequestsService, useValue: service },
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

  it('creates a request with the resolved user and trims notes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/publications/${PUBLICATION_ID}/recovery-requests`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ notes: '  Tiene una marca azul.  ' })
      .expect(201);

    expect(response.body).toEqual(RESPONSE);
    expect(service.create).toHaveBeenCalledWith(
      PUBLICATION_ID,
      { notes: 'Tiene una marca azul.' },
      { id: USER_ID, role: 'USER' },
    );
    expect(JSON.stringify(response.body)).not.toContain('ownerId');
    expect(JSON.stringify(response.body)).not.toContain('requesterId');
    expect(JSON.stringify(response.body)).not.toContain('cancelledById');
    expect(JSON.stringify(response.body)).not.toContain('@');
  });

  it('lists mine and received requests', async () => {
    const mine = await request(app.getHttpServer())
      .get('/api/v1/recovery-requests/mine')
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);
    const received = await request(app.getHttpServer())
      .get('/api/v1/recovery-requests/received')
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);

    expect(mine.body).toEqual([RESPONSE]);
    expect(received.body).toEqual([RESPONSE]);
    expect(service.findMine).toHaveBeenCalledWith(USER_ID);
    expect(service.findReceived).toHaveBeenCalledWith({
      id: USER_ID,
      role: 'USER',
    });
  });

  it('completes a recovery request with optional return notes', async () => {
    const response = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/complete`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ returnNotes: '  Entregado.  ' })
      .expect(200);

    expect(service.complete).toHaveBeenCalledWith(
      REQUEST_ID,
      { returnNotes: 'Entregado.' },
      { id: USER_ID, role: 'USER' },
    );
    expect(response.body.status).toBe('COMPLETED');
    expect(response.body.completedAt).toBe('2026-11-08T10:00:00.000Z');
    expect(response.body.returnNotes).toBe('Entregado.');
    expect(response.body.publication.status).toBe('RETURNED');
    expect(JSON.stringify(response.body)).not.toContain('completedById');
    expect(JSON.stringify(response.body)).not.toContain('ownerId');
    expect(JSON.stringify(response.body)).not.toContain('@');
  });

  it('approves, rejects and cancels with HTTP 200', async () => {
    const approve = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/approve`)
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);
    const reject = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/reject`)
      .set('X-Demo-User-Id', USER_ID)
      .expect(200);
    const cancel = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/cancel`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ reason: '  Motivo válido  ' })
      .expect(200);

    expect(approve.body.status).toBe('APPROVED');
    expect(reject.body.status).toBe('REJECTED');
    expect(cancel.body.status).toBe('CANCELLED');
    expect(service.cancel).toHaveBeenCalledWith(
      REQUEST_ID,
      { reason: 'Motivo válido' },
      { id: USER_ID, role: 'USER' },
    );
  });

  it('returns 400 for an invalid UUID, invalid notes or unknown fields', async () => {
    const invalidId = await request(app.getHttpServer())
      .post('/api/v1/publications/not-a-uuid/recovery-requests')
      .set('X-Demo-User-Id', USER_ID)
      .send({})
      .expect(400);
    const invalidNotes = await request(app.getHttpServer())
      .post(`/api/v1/publications/${PUBLICATION_ID}/recovery-requests`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ notes: 'a'.repeat(501) })
      .expect(400);
    const unknownField = await request(app.getHttpServer())
      .post(`/api/v1/publications/${PUBLICATION_ID}/recovery-requests`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ status: 'APPROVED' })
      .expect(400);
    const invalidReason = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/cancel`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ reason: '  x  ' })
      .expect(400);
    const invalidReturnNotes = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/complete`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ returnNotes: 'a'.repeat(501) })
      .expect(400);
    const unknownCompletionField = await request(app.getHttpServer())
      .post(`/api/v1/recovery-requests/${REQUEST_ID}/complete`)
      .set('X-Demo-User-Id', USER_ID)
      .send({ completedById: USER_ID })
      .expect(400);

    for (const response of [
      invalidId,
      invalidNotes,
      unknownField,
      invalidReason,
      invalidReturnNotes,
      unknownCompletionField,
    ]) {
      expect(response.body.code).toBe('VALIDATION_ERROR');
    }
    expect(invalidId.body.details[0].field).toBe('id');
    expect(invalidNotes.body.details[0].field).toBe('notes');
    expect(invalidReason.body.details[0].field).toBe('reason');
    expect(invalidReturnNotes.body.details[0].field).toBe('returnNotes');
    expect(service.create).not.toHaveBeenCalled();
    expect(service.cancel).not.toHaveBeenCalled();
    expect(service.complete).not.toHaveBeenCalled();
  });

  it('requires a valid demo identity', async () => {
    const missing = await request(app.getHttpServer())
      .get('/api/v1/recovery-requests/mine')
      .expect(401);
    const invalid = await request(app.getHttpServer())
      .get('/api/v1/recovery-requests/mine')
      .set('X-Demo-User-Id', 'invalid')
      .expect(401);

    expect(missing.body.code).toBe('DEMO_IDENTITY_REQUIRED');
    expect(invalid.body.code).toBe('DEMO_IDENTITY_INVALID');
  });

  it('preserves the completion error contract', async () => {
    for (const code of [
      'RECOVERY_REQUEST_ALREADY_COMPLETED',
      'RECOVERY_REQUEST_NOT_APPROVED',
      'RECOVERY_REQUEST_CONFLICT',
    ]) {
      service.complete.mockRejectedValueOnce(
        new ConflictException({
          statusCode: 409,
          code,
          message: 'conflict',
        }),
      );

      const response = await request(app.getHttpServer())
        .post(`/api/v1/recovery-requests/${REQUEST_ID}/complete`)
        .set('X-Demo-User-Id', USER_ID)
        .send({})
        .expect(409);

      expect(response.body.code).toBe(code);
    }
  });

  it('preserves the service error contract', async () => {
    service.create.mockRejectedValueOnce(
      new ForbiddenException({
        statusCode: 403,
        code: 'RECOVERY_REQUEST_FORBIDDEN',
        message: 'forbidden',
      }),
    );
    service.create.mockRejectedValueOnce(
      new NotFoundException({
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'missing',
      }),
    );
    service.create.mockRejectedValueOnce(
      new ConflictException({
        statusCode: 409,
        code: 'RECOVERY_REQUEST_DUPLICATE',
        message: 'duplicate',
      }),
    );

    for (const [status, code] of [
      [403, 'RECOVERY_REQUEST_FORBIDDEN'],
      [404, 'PUBLICATION_NOT_FOUND'],
      [409, 'RECOVERY_REQUEST_DUPLICATE'],
    ] as const) {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/publications/${PUBLICATION_ID}/recovery-requests`)
        .set('X-Demo-User-Id', USER_ID)
        .send({})
        .expect(status);

      expect(response.body.code).toBe(code);
    }
  });
});
