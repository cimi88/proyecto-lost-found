import type { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../identity/identity.types';
import { Publication } from '../publications/publication.entity';
import { RecoveryRequest } from './recovery-request.entity';
import { RecoveryRequestsService } from './recovery-requests.service';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const PUBLICATION_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const REQUESTER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';

const OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'USER' };
const REQUESTER: AuthenticatedUser = { id: REQUESTER_ID, role: 'USER' };
const ADMIN: AuthenticatedUser = { id: OTHER_ID, role: 'ADMIN' };
const ADMIN_OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'ADMIN' };
const ADMIN_REQUESTER: AuthenticatedUser = { id: REQUESTER_ID, role: 'ADMIN' };
const STRANGER: AuthenticatedUser = { id: OTHER_ID, role: 'USER' };

const FORBIDDEN = {
  response: { statusCode: 403, code: 'RECOVERY_REQUEST_FORBIDDEN' },
};

function setup(queue: unknown[]) {
  const where = jest.fn().mockReturnThis();
  const listBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where,
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => []),
  };
  const manager = {
    transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
      callback(manager),
    ),
    findOne: jest.fn(async () => queue.shift()),
    find: jest.fn(async () => []),
    update: jest.fn(async () => ({ affected: 1 })),
    createQueryBuilder: jest.fn(() => ({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: 1 })),
    })),
  };
  const repository = {
    manager,
    createQueryBuilder: jest.fn(() => listBuilder),
  };

  return {
    service: new RecoveryRequestsService(
      repository as unknown as Repository<RecoveryRequest>,
    ),
    manager,
    where,
  };
}

const publication = (status = 'ACTIVE') =>
  ({
    id: PUBLICATION_ID,
    type: 'FOUND',
    status,
    ownerId: OWNER_ID,
  }) as unknown as Publication;

const request = (status: string) =>
  ({
    id: REQUEST_ID,
    publicationId: PUBLICATION_ID,
    requesterId: REQUESTER_ID,
    status,
  }) as unknown as RecoveryRequest;

describe('RecoveryRequestsService authorization regressions', () => {
  it.each([
    ['USER', OWNER],
    ['ADMIN non-owner', ADMIN],
    ['ADMIN owner', ADMIN_OWNER],
    ['ADMIN requester', ADMIN_REQUESTER],
  ])(
    'scopes received strictly to publication.ownerId for %s',
    async (_label, actor) => {
      const { service, where } = setup([]);

      await service.findReceived(actor as AuthenticatedUser);

      expect(where).toHaveBeenCalledTimes(1);
      expect(where).toHaveBeenCalledWith('publication.ownerId = :userId', {
        userId: (actor as AuthenticatedUser).id,
      });
    },
  );

  it.each([
    ['USER requester', REQUESTER],
    ['ADMIN non-owner', ADMIN],
    ['USER stranger', STRANGER],
  ])('forbids complete for %s', async (_label, actor) => {
    const { service, manager } = setup([
      { id: REQUEST_ID, publicationId: PUBLICATION_ID },
      publication('RESERVED'),
      request('APPROVED'),
    ]);

    await expect(
      service.complete(REQUEST_ID, {}, actor as AuthenticatedUser),
    ).rejects.toMatchObject(FORBIDDEN);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([
    ['USER requester', REQUESTER],
    ['ADMIN non-owner', ADMIN],
    ['USER stranger', STRANGER],
  ])('forbids approve for %s', async (_label, actor) => {
    const { service, manager } = setup([
      { id: REQUEST_ID, publicationId: PUBLICATION_ID },
      publication(),
      request('PENDING'),
    ]);

    await expect(
      service.approve(REQUEST_ID, actor as AuthenticatedUser),
    ).rejects.toMatchObject(FORBIDDEN);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([
    ['USER requester', REQUESTER],
    ['ADMIN non-owner', ADMIN],
    ['USER stranger', STRANGER],
  ])('forbids reject for %s', async (_label, actor) => {
    const { service, manager } = setup([
      request('PENDING'),
      publication(),
    ]);

    await expect(
      service.reject(REQUEST_ID, actor as AuthenticatedUser),
    ).rejects.toMatchObject(FORBIDDEN);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([
    ['USER owner', OWNER],
    ['ADMIN non-owner', ADMIN],
    ['USER stranger', STRANGER],
  ])('forbids cancelling a PENDING request for %s', async (_label, actor) => {
    const { service, manager } = setup([
      { id: REQUEST_ID, publicationId: PUBLICATION_ID, status: 'PENDING' },
      request('PENDING'),
    ]);

    await expect(
      service.cancel(
        REQUEST_ID,
        { reason: 'Motivo válido' },
        actor as AuthenticatedUser,
      ),
    ).rejects.toMatchObject(FORBIDDEN);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it.each([
    ['ADMIN non-owner', ADMIN],
    ['USER stranger', STRANGER],
  ])(
    'forbids cancelling an APPROVED request for %s',
    async (_label, actor) => {
      const { service, manager } = setup([
        { id: REQUEST_ID, publicationId: PUBLICATION_ID, status: 'APPROVED' },
        { id: REQUEST_ID, publicationId: PUBLICATION_ID },
        publication('RESERVED'),
        request('APPROVED'),
      ]);

      await expect(
        service.cancel(
          REQUEST_ID,
          { reason: 'Motivo válido' },
          actor as AuthenticatedUser,
        ),
      ).rejects.toMatchObject(FORBIDDEN);
      expect(manager.update).not.toHaveBeenCalled();
    },
  );
});
