import type { Repository } from 'typeorm';
import type { AuthenticatedUser } from '../identity/identity.types';
import { RecoveryRequest } from '../recovery-requests/recovery-request.entity';
import { PublicationMatchingService } from './matching/publication-matching.service';
import { Publication } from './publication.entity';
import { PublicationsService } from './publications.service';

const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_ID = '55555555-5555-4555-8555-555555555555';

const OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'USER' };
const ADMIN_OWNER: AuthenticatedUser = { id: OWNER_ID, role: 'ADMIN' };
const ADMIN: AuthenticatedUser = { id: OTHER_ID, role: 'ADMIN' };
const OTHER: AuthenticatedUser = { id: OTHER_ID, role: 'USER' };

const UPDATE_INPUT = {
  title: 'Mochila negra actualizada',
  description: 'Mochila negra con una marca azul y una etiqueta nueva.',
  category: 'BAGS' as const,
  location: 'Plaza Central, banco 3',
  eventDate: '2026-11-02',
};

function buildPublication(
  overrides: Partial<Publication> = {},
): Publication {
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
    searchText: 'mochila negra plaza central',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:00:00.000Z'),
    ...overrides,
  };
}

function buildService() {
  const manager = {
    transaction: jest.fn(
      async (callback: (transactionManager: unknown) => unknown) =>
        callback(manager),
    ),
    findOne: jest.fn(),
    find: jest.fn(),
    update: jest.fn(async () => ({ affected: 1 })),
  };
  const repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    manager,
  };
  const matching = {
    regenerateForPublication: jest.fn(async () => []),
  };

  return {
    service: new PublicationsService(
      repository as unknown as Repository<Publication>,
      matching as unknown as PublicationMatchingService,
    ),
    repository,
    manager,
    matching,
  };
}

describe('PublicationsService management', () => {
  it('lists all own publications for USER and ADMIN owners without ownerId', async () => {
    const { service, repository } = buildService();
    repository.find.mockResolvedValueOnce([
      buildPublication(),
      buildPublication({ status: 'CLOSED' }),
    ]);

    const result = await service.findMine(OWNER_ID);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ownerId: OWNER_ID },
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
    expect(result).toHaveLength(2);
    expect(result[0].status).toBe('ACTIVE');
    expect(result[1].status).toBe('CLOSED');
    expect(result[0]).not.toHaveProperty('ownerId');

    repository.find.mockResolvedValueOnce([]);
    await expect(service.findMine(ADMIN_OWNER.id)).resolves.toEqual([]);
  });

  it('lists only ACTIVE publications of other owners for ADMIN moderation', async () => {
    const { service, repository } = buildService();
    repository.find.mockResolvedValueOnce([
      buildPublication({ ownerId: OWNER_ID }),
    ]);

    const result = await service.findActivePublicationsForAdmin(ADMIN);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: 'ACTIVE',
          ownerId: expect.objectContaining({ _value: OTHER_ID }),
        },
        order: { createdAt: 'DESC', id: 'DESC' },
      }),
    );
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('ownerId');
  });

  it('forbids USER from listing the global moderation publications', async () => {
    const { service, repository } = buildService();

    await expect(
      service.findActivePublicationsForAdmin(OWNER),
    ).rejects.toMatchObject({
      response: { code: 'ADMIN_FORBIDDEN' },
    });
    expect(repository.find).not.toHaveBeenCalled();
  });

  it('finds an own publication in any state and hides foreign publications', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValueOnce(
      buildPublication({ status: 'RETURNED' }),
    );

    await expect(service.findMineById(PUBLICATION_ID, OWNER_ID)).resolves.toMatchObject({
      id: PUBLICATION_ID,
      status: 'RETURNED',
    });
    expect(repository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: PUBLICATION_ID, ownerId: OWNER_ID },
      }),
    );

    repository.findOne.mockResolvedValueOnce(null);
    await expect(
      service.findMineById(PUBLICATION_ID, OTHER.id),
    ).rejects.toMatchObject({
      response: { code: 'PUBLICATION_NOT_FOUND' },
    });
  });

  it('updates an active own publication and regenerates its suggestions', async () => {
    const { service, manager, matching } = buildService();
    const updated = buildPublication({
      ...UPDATE_INPUT,
      searchText: 'mochila negra actualizada plaza central banco 3',
    });
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(updated);

    const result = await service.updateOwnPublication(
      PUBLICATION_ID,
      UPDATE_INPUT,
      ADMIN_OWNER.id,
    );

    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID, ownerId: OWNER_ID, status: 'ACTIVE' },
      UPDATE_INPUT,
    );
    expect(matching.regenerateForPublication).toHaveBeenCalledWith(
      manager,
      updated,
    );
    expect(result).toMatchObject({
      id: PUBLICATION_ID,
      title: UPDATE_INPUT.title,
      status: 'ACTIVE',
    });
  });

  it('does not edit a foreign or non-active publication, including as ADMIN', async () => {
    const foreign = buildService();
    foreign.manager.findOne.mockResolvedValueOnce(
      buildPublication({ ownerId: OTHER_ID }),
    );
    await expect(
      foreign.service.updateOwnPublication(PUBLICATION_ID, UPDATE_INPUT, OWNER_ID),
    ).rejects.toMatchObject({
      response: { code: 'PUBLICATION_NOT_FOUND' },
    });
    expect(foreign.manager.update).not.toHaveBeenCalled();

    const adminForeign = buildService();
    adminForeign.manager.findOne.mockResolvedValueOnce(
      buildPublication({ ownerId: OWNER_ID }),
    );
    await expect(
      adminForeign.service.updateOwnPublication(
        PUBLICATION_ID,
        UPDATE_INPUT,
        ADMIN.id,
      ),
    ).rejects.toMatchObject({
      response: { code: 'PUBLICATION_NOT_FOUND' },
    });
    expect(adminForeign.manager.update).not.toHaveBeenCalled();

    for (const status of ['RESERVED', 'RETURNED', 'CLOSED'] as const) {
      const service = buildService();
      service.manager.findOne.mockResolvedValueOnce(
        buildPublication({ status }),
      );
      await expect(
        service.service.updateOwnPublication(
          PUBLICATION_ID,
          UPDATE_INPUT,
          OWNER_ID,
        ),
      ).rejects.toMatchObject({
        response: { code: 'PUBLICATION_NOT_EDITABLE' },
      });
      expect(service.manager.update).not.toHaveBeenCalled();
    }
  });

  it('closes an active own publication logically', async () => {
    const { service, manager, matching } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildPublication({ status: 'CLOSED' }));
    manager.find.mockResolvedValueOnce([]);

    const result = await service.closePublication(
      PUBLICATION_ID,
      ADMIN_OWNER,
    );

    expect(manager.find).toHaveBeenCalledWith(
      RecoveryRequest,
      expect.objectContaining({
        where: expect.objectContaining({
          publicationId: PUBLICATION_ID,
          status: expect.objectContaining({
            _value: ['PENDING', 'APPROVED'],
          }),
        }),
      }),
    );
    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID, ownerId: OWNER_ID, status: 'ACTIVE' },
      { status: 'CLOSED' },
    );
    expect(matching.regenerateForPublication).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'CLOSED' });
  });

  it('allows ADMIN moderator to close an ACTIVE publication owned by another user', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildPublication({ status: 'CLOSED' }));
    manager.find.mockResolvedValueOnce([]);

    const result = await service.closePublication(PUBLICATION_ID, ADMIN);

    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID, ownerId: OWNER_ID, status: 'ACTIVE' },
      { status: 'CLOSED' },
    );
    expect(result).toMatchObject({ status: 'CLOSED' });
  });

  it('blocks ADMIN moderator from closing with pending or approved requests', async () => {
    for (const status of ['PENDING', 'APPROVED'] as const) {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(buildPublication());
      manager.find.mockResolvedValueOnce([{ id: 'request-1', status }]);

      await expect(
        service.closePublication(PUBLICATION_ID, ADMIN),
      ).rejects.toMatchObject({
        response: { code: 'PUBLICATION_HAS_ACTIVE_REQUESTS' },
      });
      expect(manager.update).not.toHaveBeenCalled();
    }
  });

  it('blocks ADMIN moderator from closing non-active publications', async () => {
    for (const status of ['RESERVED', 'RETURNED', 'CLOSED'] as const) {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(
        buildPublication({ status }),
      );

      await expect(
        service.closePublication(PUBLICATION_ID, ADMIN),
      ).rejects.toMatchObject({
        response: { code: 'PUBLICATION_NOT_CLOSABLE' },
      });
      expect(manager.update).not.toHaveBeenCalled();
    }
  });

  it('blocks closing with pending or approved requests', async () => {
    for (const status of ['PENDING', 'APPROVED'] as const) {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValueOnce(buildPublication());
      manager.find.mockResolvedValueOnce([{ id: 'request-1', status }]);

      await expect(
        service.closePublication(PUBLICATION_ID, OWNER),
      ).rejects.toMatchObject({
        response: { code: 'PUBLICATION_HAS_ACTIVE_REQUESTS' },
      });
      expect(manager.update).not.toHaveBeenCalled();
    }
  });

  it('allows closing when recovery requests are terminal', async () => {
    const { service, manager } = buildService();
    manager.findOne
      .mockResolvedValueOnce(buildPublication())
      .mockResolvedValueOnce(buildPublication({ status: 'CLOSED' }));
    manager.find.mockResolvedValueOnce([]);

    const result = await service.closePublication(
      PUBLICATION_ID,
      OWNER,
    );

    expect(result.status).toBe('CLOSED');
    expect(manager.update).toHaveBeenCalledWith(
      Publication,
      { id: PUBLICATION_ID, ownerId: OWNER_ID, status: 'ACTIVE' },
      { status: 'CLOSED' },
    );
  });

  it('does not close foreign or non-active publications', async () => {
    const foreign = buildService();
    foreign.manager.findOne.mockResolvedValueOnce(
      buildPublication({ ownerId: OTHER_ID }),
    );
    await expect(
      foreign.service.closePublication(PUBLICATION_ID, OWNER),
    ).rejects.toMatchObject({
      response: { code: 'PUBLICATION_NOT_FOUND' },
    });
    expect(foreign.manager.find).not.toHaveBeenCalled();
    expect(foreign.manager.update).not.toHaveBeenCalled();

    for (const status of ['RESERVED', 'RETURNED', 'CLOSED'] as const) {
      const service = buildService();
      service.manager.findOne.mockResolvedValueOnce(
        buildPublication({ status }),
      );
      await expect(
        service.service.closePublication(PUBLICATION_ID, OWNER),
      ).rejects.toMatchObject({
        response: { code: 'PUBLICATION_NOT_CLOSABLE' },
      });
      expect(service.manager.update).not.toHaveBeenCalled();
    }
  });
});
