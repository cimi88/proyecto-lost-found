import type { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../identity/identity.types';
import { Publication } from '../publications/publication.entity';
import { RecoveryRequest } from './recovery-request.entity';
import type { RecoveryRequestResponse } from './recovery-request-response';
import { RecoveryRequestsService } from './recovery-requests.service';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';
const PUBLICATION_ID = '22222222-2222-4222-8222-222222222222';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const REQUESTER_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';

const REQUESTER: AuthenticatedUser = { id: REQUESTER_ID, role: 'USER' };
const OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'USER' };
const ADMIN: AuthenticatedUser = { id: OTHER_ID, role: 'ADMIN' };
const ADMIN_OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'ADMIN' };
const ADMIN_REQUESTER: AuthenticatedUser = {
  id: REQUESTER_ID,
  role: 'ADMIN',
};

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

type ManagerMock = {
  transaction: jest.Mock;
  findOne: jest.Mock;
  find: jest.Mock;
  update: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  createQueryBuilder: jest.Mock;
};

type BuilderMock = {
  update: jest.Mock;
  set: jest.Mock;
  where: jest.Mock;
  andWhere: jest.Mock;
  execute: jest.Mock;
};

function buildPublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: PUBLICATION_ID,
    type: 'FOUND',
    status: 'ACTIVE',
    ownerId: OWNER_ID,
    title: 'Mochila negra',
    description: 'Mochila negra con una marca azul.',
    category: 'BAGS',
    location: 'Plaza Central',
    eventDate: '2026-11-01',
    searchText: 'mochila negra',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:00:00.000Z'),
    ...overrides,
  };
}

function buildRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    id: REQUEST_ID,
    publicationId: PUBLICATION_ID,
    requesterId: REQUESTER_ID,
    status: 'PENDING',
    notes: 'Tiene una marca azul.',
    cancelledById: null,
    cancellationReason: null,
    completedAt: null,
    completedById: null,
    returnNotes: null,
    createdAt: new Date('2026-11-07T10:00:00.000Z'),
    updatedAt: new Date('2026-11-07T10:00:00.000Z'),
    ...overrides,
  };
}

function buildService() {
  const updateBuilder: BuilderMock = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn(async () => ({ affected: 1 })),
  };
  const listBuilder = {
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn(async () => []),
  };
  let manager: ManagerMock;
  manager = {
    transaction: jest.fn(
      async (callback: (transactionManager: ManagerMock) => unknown) =>
        callback(manager),
    ),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
    create: jest.fn((_entity: unknown, input: Partial<RecoveryRequest>) => ({
      ...input,
    })),
    save: jest.fn(
      async (_entity: unknown, input: Partial<RecoveryRequest>) => ({
        id: REQUEST_ID,
        createdAt: new Date('2026-11-07T10:00:00.000Z'),
        updatedAt: new Date('2026-11-07T10:00:00.000Z'),
        ...input,
      }),
    ),
    createQueryBuilder: jest.fn(() => updateBuilder),
  };
  const repository = {
    manager,
    createQueryBuilder: jest.fn(() => listBuilder),
  };
  const service = new RecoveryRequestsService(
    repository as unknown as Repository<RecoveryRequest>,
  );
  const responseSpy = jest
    .spyOn(
      service as unknown as {
        findResponseById: (
          manager: ManagerMock,
          id: string,
        ) => Promise<RecoveryRequestResponse>;
      },
      'findResponseById',
    )
    .mockResolvedValue(RESPONSE);

  return {
    service,
    manager,
    repository,
    updateBuilder,
    listBuilder,
    responseSpy,
  };
}

describe('RecoveryRequestsService', () => {
  it('creates a pending request after locking and validating the publication', async () => {
    const { service, manager, repository, responseSpy } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(null);

    const result = await service.create(
      PUBLICATION_ID,
      { notes: '  Tiene una marca azul.  ' },
      REQUESTER,
    );

    expect(manager.findOne).toHaveBeenNthCalledWith(
      1,
      Publication,
      expect.objectContaining({
        where: { id: PUBLICATION_ID },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(manager.create).toHaveBeenCalledWith(
      RecoveryRequest,
      expect.objectContaining({
        publicationId: PUBLICATION_ID,
        requesterId: REQUESTER_ID,
        status: 'PENDING',
        notes: 'Tiene una marca azul.',
        cancelledById: null,
        cancellationReason: null,
      }),
    );
    expect(manager.save).toHaveBeenCalledTimes(1);
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(RESPONSE);
  });

  it('rejects a non-FOUND, non-ACTIVE or missing publication with PUBLICATION_NOT_FOUND', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }));

    await expect(
      service.create(PUBLICATION_ID, {}, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'PUBLICATION_NOT_FOUND' },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects the publication owner with RECOVERY_REQUEST_FORBIDDEN', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValueOnce(buildPublication());

    await expect(
      service.create(PUBLICATION_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rejects a duplicate active request', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildRequest());

    await expect(
      service.create(PUBLICATION_ID, {}, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_DUPLICATE' },
    });
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('maps a unique violation on create to RECOVERY_REQUEST_DUPLICATE', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(null);
    manager.save.mockRejectedValueOnce({ driverError: { code: '23505' } });

    await expect(
      service.create(PUBLICATION_ID, {}, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_DUPLICATE' },
    });
  });

  it('scopes mine by requester and received by publication owner', async () => {
    const { service, listBuilder } = buildService();

    await service.findMine(REQUESTER_ID);
    expect(listBuilder.where).toHaveBeenCalledWith(
      'request.requesterId = :userId',
      { userId: REQUESTER_ID },
    );

    listBuilder.where.mockClear();
    await service.findReceived(OWNER);
    expect(listBuilder.where).toHaveBeenCalledWith(
      'publication.ownerId = :userId',
      { userId: OWNER_ID },
    );
    expect(listBuilder.orderBy).toHaveBeenCalledWith(
      'request.createdAt',
      'DESC',
    );
    expect(listBuilder.addOrderBy).toHaveBeenCalledWith('request.id', 'DESC');

    listBuilder.where.mockClear();
    await service.findReceived(ADMIN);
    expect(listBuilder.where).toHaveBeenCalledWith(
      'publication.ownerId = :userId',
      { userId: OTHER_ID },
    );

    listBuilder.where.mockClear();
    await service.findReceived(ADMIN_OWNER);
    expect(listBuilder.where).toHaveBeenCalledWith(
      'publication.ownerId = :userId',
      { userId: OWNER_ID },
    );
  });

  it('completes an approved reservation as the owner', async () => {
    const { service, manager, responseSpy } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    const completedResponse: RecoveryRequestResponse = {
      ...RESPONSE,
      status: 'COMPLETED',
      completedAt: '2026-11-08T10:00:00.000Z',
      returnNotes: 'Entregado en la puerta.',
      publication: {
        ...RESPONSE.publication,
        status: 'RETURNED',
      },
    };
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([approved]);
    responseSpy.mockResolvedValueOnce(completedResponse);

    const result = await service.complete(
      REQUEST_ID,
      { returnNotes: '  Entregado en la puerta.  ' },
      OWNER,
    );

    expect(manager.find).toHaveBeenCalledWith(
      RecoveryRequest,
      expect.objectContaining({
        where: { publicationId: PUBLICATION_ID, status: 'APPROVED' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      RecoveryRequest,
      { id: REQUEST_ID, status: 'APPROVED' },
      {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        completedById: OWNER_ID,
        returnNotes: 'Entregado en la puerta.',
      },
    );
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      Publication,
      { id: PUBLICATION_ID, status: 'RESERVED' },
      { status: 'RETURNED' },
    );
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(completedResponse);
  });

  it('allows ADMIN owner to complete a reservation', async () => {
    const { service, manager } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([approved]);

    await service.complete(REQUEST_ID, {}, ADMIN_OWNER);

    expect(manager.update).toHaveBeenNthCalledWith(
      1,
      RecoveryRequest,
      { id: REQUEST_ID, status: 'APPROVED' },
      {
        status: 'COMPLETED',
        completedAt: expect.any(Date),
        completedById: OWNER_ID,
        returnNotes: null,
      },
    );
  });

  it('forbids the requester and non-owner actors from completing', async () => {
    for (const actor of [
      REQUESTER,
      ADMIN,
      { id: '66666666-6666-4666-8666-666666666666', role: 'USER' as const },
    ]) {
      const { service, manager } = buildService();
      manager.findOne
        .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
        .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
        .mockResolvedValueOnce(buildRequest({ status: 'APPROVED' }));

      await expect(
        service.complete(REQUEST_ID, {}, actor),
      ).rejects.toMatchObject({
        response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
      });
      expect(manager.update).not.toHaveBeenCalled();
    }
  });

  it('returns not found when the request does not exist', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValueOnce(null);

    await expect(
      service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_NOT_FOUND' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects completion of a non-approved or already completed request', async () => {
    const pending = buildService();
    pending.manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(buildRequest({ status: 'PENDING' }));

    await expect(
      pending.service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_NOT_APPROVED' },
    });

    const completed = buildService();
    completed.manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RETURNED' }))
      .mockResolvedValueOnce(buildRequest({ status: 'COMPLETED' }));

    await expect(
      completed.service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_ALREADY_COMPLETED' },
    });
  });

  it('rejects completion when the publication is not reserved', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'ACTIVE' }))
      .mockResolvedValueOnce(buildRequest({ status: 'APPROVED' }));

    await expect(
      service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('aborts completion when the approved reservation is inconsistent', async () => {
    const { service, manager } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([
      approved,
      buildRequest({ id: OTHER_ID, status: 'APPROVED' }),
    ]);

    await expect(
      service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('aborts completion if a conditional update loses the race', async () => {
    const { service, manager } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([approved]);
    manager.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });

    await expect(
      service.complete(REQUEST_ID, {}, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
  });

  it('approves a pending request, reserves the publication and rejects the others', async () => {
    const { service, manager, updateBuilder, responseSpy } = buildService();
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(null);

    const result = await service.approve(REQUEST_ID, OWNER);

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      { status: 'APPROVED' },
    );
    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID },
      { status: 'RESERVED' },
    );
    expect(updateBuilder.set).toHaveBeenCalledWith({ status: 'REJECTED' });
    expect(updateBuilder.andWhere).toHaveBeenCalledWith(
      'id <> :requestId',
      { requestId: REQUEST_ID },
    );
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(RESPONSE);
  });

  it('allows ADMIN owner to approve a pending request', async () => {
    const { service, manager, responseSpy } = buildService();
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(null);

    const result = await service.approve(REQUEST_ID, ADMIN_OWNER);

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      { status: 'APPROVED' },
    );
    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID },
      { status: 'RESERVED' },
    );
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(RESPONSE);
  });

  it('does not approve when another request is already approved', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(buildRequest({ id: OTHER_ID }));

    await expect(service.approve(REQUEST_ID, OWNER)).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects approval by a non-owner, including a non-owner ADMIN', async () => {
    for (const actor of [REQUESTER, ADMIN]) {
      const { service, manager } = buildService();
      manager.findOne
        .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
        .mockResolvedValueOnce(buildPublication())
        .mockResolvedValueOnce(buildRequest());

      await expect(service.approve(REQUEST_ID, actor)).rejects.toMatchObject({
        response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
      });
    }
  });

  it('rejects a pending request without changing the publication', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(buildPublication());

    await service.reject(REQUEST_ID, OWNER);

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      { status: 'REJECTED' },
    );
    expect(manager.update).not.toHaveBeenCalledWith(
      Publication,
      expect.anything(),
      expect.anything(),
    );
  });

  it('allows ADMIN owner to reject a pending request', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(buildPublication());

    await service.reject(REQUEST_ID, ADMIN_OWNER);

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      { status: 'REJECTED' },
    );
  });

  it('forbids a non-owner ADMIN from rejecting a pending request', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildRequest())
      .mockResolvedValueOnce(buildPublication());

    await expect(service.reject(REQUEST_ID, ADMIN)).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
    });
  });

  it('cancels a pending request only for its requester', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'PENDING',
      })
      .mockResolvedValueOnce(buildRequest());

    await service.cancel(
      REQUEST_ID,
      { reason: '  Ya lo encontré.  ' },
      REQUESTER,
    );

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      {
        status: 'CANCELLED',
        cancelledById: REQUESTER_ID,
        cancellationReason: 'Ya lo encontré.',
      },
    );
  });

  it('allows ADMIN requester to cancel their own pending request', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'PENDING',
      })
      .mockResolvedValueOnce(buildRequest());

    await service.cancel(
      REQUEST_ID,
      { reason: 'Ya no la necesito.' },
      ADMIN_REQUESTER,
    );

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      {
        status: 'CANCELLED',
        cancelledById: REQUESTER_ID,
        cancellationReason: 'Ya no la necesito.',
      },
    );
  });

  it('forbids an owner or a non-requester ADMIN from cancelling a pending request', async () => {
    for (const actor of [OWNER, ADMIN]) {
      const { service, manager } = buildService();
      manager.findOne
        .mockResolvedValueOnce({
          id: REQUEST_ID,
          publicationId: PUBLICATION_ID,
          status: 'PENDING',
        })
        .mockResolvedValueOnce(buildRequest());

      await expect(
        service.cancel(REQUEST_ID, { reason: 'Motivo válido' }, actor),
      ).rejects.toMatchObject({
        response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
      });
    }
  });

  it('allows ADMIN owner to cancel an approved request', async () => {
    const { service, manager, responseSpy } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'APPROVED',
      })
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([approved]);

    const result = await service.cancel(
      REQUEST_ID,
      { reason: 'El solicitante desistió.' },
      ADMIN_OWNER,
    );

    expect(manager.find).toHaveBeenCalledWith(
      RecoveryRequest,
      expect.objectContaining({
        where: { publicationId: PUBLICATION_ID, status: 'APPROVED' },
        lock: { mode: 'pessimistic_write' },
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      {
        status: 'CANCELLED',
        cancelledById: OWNER_ID,
        cancellationReason: 'El solicitante desistió.',
      },
    );
    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID },
      { status: 'ACTIVE' },
    );
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(RESPONSE);
  });

  it('allows ADMIN requester to cancel an approved request', async () => {
    const { service, manager, responseSpy } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'APPROVED',
      })
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([approved]);

    const result = await service.cancel(
      REQUEST_ID,
      { reason: 'El solicitante desistió.' },
      ADMIN_REQUESTER,
    );

    expect(manager.update).toHaveBeenCalledWith(
      RecoveryRequest,
      { id: REQUEST_ID },
      {
        status: 'CANCELLED',
        cancelledById: REQUESTER_ID,
        cancellationReason: 'El solicitante desistió.',
      },
    );
    expect(responseSpy).toHaveBeenCalledWith(manager, REQUEST_ID);
    expect(result).toBe(RESPONSE);
  });

  it('forbids an ADMIN who is neither requester nor owner from cancelling an approved request', async () => {
    const { service, manager } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'APPROVED',
      })
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);

    await expect(
      service.cancel(REQUEST_ID, { reason: 'Motivo válido' }, ADMIN),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_FORBIDDEN' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('aborts an approved cancellation when the publication is not reserved', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'APPROVED',
      })
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'ACTIVE' }))
      .mockResolvedValueOnce(buildRequest({ status: 'APPROVED' }));

    await expect(
      service.cancel(REQUEST_ID, { reason: 'Motivo válido' }, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('aborts an approved cancellation when it is not the unique approved request', async () => {
    const { service, manager } = buildService();
    const approved = buildRequest({ status: 'APPROVED' });
    manager.findOne
      .mockResolvedValueOnce({
        id: REQUEST_ID,
        publicationId: PUBLICATION_ID,
        status: 'APPROVED',
      })
      .mockResolvedValueOnce({ id: REQUEST_ID, publicationId: PUBLICATION_ID })
      .mockResolvedValueOnce(buildPublication({ status: 'RESERVED' }))
      .mockResolvedValueOnce(approved);
    manager.find.mockResolvedValueOnce([
      approved,
      buildRequest({ id: OTHER_ID, status: 'APPROVED' }),
    ]);

    await expect(
      service.cancel(REQUEST_ID, { reason: 'Motivo válido' }, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_CONFLICT' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('rejects cancellation of a terminal request', async () => {
    const { service, manager } = buildService();
    manager.findOne.mockResolvedValueOnce({
      id: REQUEST_ID,
      publicationId: PUBLICATION_ID,
      status: 'CANCELLED',
    });

    await expect(
      service.cancel(REQUEST_ID, { reason: 'Motivo válido' }, REQUESTER),
    ).rejects.toMatchObject({
      response: { code: 'RECOVERY_REQUEST_NOT_CANCELLABLE' },
    });
  });
});
