import type { Repository } from 'typeorm';
import type { CreateFoundPublicationDto } from './dto/create-found-publication.dto';
import type { CreateLostPublicationDto } from './dto/create-lost-publication.dto';
import type { PublicationMatchingService } from './matching/publication-matching.service';
import { Publication } from './publication.entity';
import { PublicationsService } from './publications.service';

const OWNER_ID = '00000000-0000-4000-8000-000000000001';

const INPUT: CreateLostPublicationDto = {
  title: 'Bicicleta rodado 29',
  description: 'Bicicleta azul con canasto negro y una calcomanía.',
  category: 'SPORTS',
  location: 'Plaza San Martín',
  eventDate: '2024-05-10',
};

const FOUND_INPUT: CreateFoundPublicationDto = {
  title: 'Llaves con llavero de equipo',
  description: 'Llavero de metal con escudo y tres llaves pequeñas.',
  category: 'KEYS',
  location: 'Biblioteca central, mostrador de atención',
  eventDate: '2024-11-12',
};

function buildService(): {
  service: PublicationsService;
  matching: { generateForPublication: jest.Mock };
  repository: {
    create: jest.Mock;
    save: jest.Mock;
    manager: ManagerMock;
  };
} {
  type ManagerMock = {
    transaction: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };

  let savedPublication: Partial<Publication> | undefined;
  const repository: {
    create: jest.Mock;
    save: jest.Mock;
    manager?: ManagerMock;
  } = {
    create: jest.fn((input: Partial<Publication>) => ({ ...input })),
    save: jest.fn(async (entity: Partial<Publication>) => {
      savedPublication = {
        id: '11111111-1111-4111-8111-111111111111',
        createdAt: new Date('2026-11-05T10:00:00.000Z'),
        updatedAt: new Date('2026-11-05T10:00:00.000Z'),
        searchText: 'texto normalizado',
        ...entity,
      };

      return savedPublication;
    }),
  };
  let manager: ManagerMock;
  manager = {
    transaction: jest.fn(
      async (callback: (transactionManager: ManagerMock) => unknown) =>
        callback(manager),
    ),
    create: jest.fn((_entity: typeof Publication, input: Partial<Publication>) =>
      repository.create(input),
    ),
    save: jest.fn((_entity: typeof Publication, entity: Partial<Publication>) =>
      repository.save(entity),
    ),
    findOne: jest.fn(async () => savedPublication as Publication),
  };
  repository.manager = manager;
  const matching = {
    generateForPublication: jest.fn(async () => []),
  };

  return {
    service: new PublicationsService(
      repository as unknown as Repository<Publication>,
      matching as unknown as PublicationMatchingService,
    ),
    matching,
    repository: repository as { create: jest.Mock; save: jest.Mock; manager: ManagerMock },
  };
}

describe('PublicationsService', () => {
  it('persists a LOST publication owned by the resolved user', async () => {
    const { service, repository, matching } = buildService();

    const response = await service.createLostPublication(INPUT, OWNER_ID);

    expect(repository.create).toHaveBeenCalledWith({
      id: expect.any(String),
      type: 'LOST',
      status: 'ACTIVE',
      ownerId: OWNER_ID,
      title: INPUT.title,
      description: INPUT.description,
      category: INPUT.category,
      location: INPUT.location,
      eventDate: INPUT.eventDate,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(matching.generateForPublication).toHaveBeenCalledWith(
      repository.manager,
      expect.objectContaining({
        type: 'LOST',
        status: 'ACTIVE',
        searchText: 'texto normalizado',
      }),
    );
    expect(repository.manager.findOne).toHaveBeenCalledWith(
      Publication,
      expect.objectContaining({
        where: { id: expect.any(String), status: 'ACTIVE' },
      }),
    );
    expect(response).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'LOST',
      status: 'ACTIVE',
      ownerId: OWNER_ID,
      title: INPUT.title,
      category: 'SPORTS',
      eventDate: '2024-05-10',
    });
    expect(response.createdAt).toBe('2026-11-05T10:00:00.000Z');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('persists a FOUND publication owned by the resolved user', async () => {
    const { service, repository, matching } = buildService();

    const response = await service.createFoundPublication(
      FOUND_INPUT,
      OWNER_ID,
    );

    expect(repository.create).toHaveBeenCalledWith({
      id: expect.any(String),
      type: 'FOUND',
      status: 'ACTIVE',
      ownerId: OWNER_ID,
      title: FOUND_INPUT.title,
      description: FOUND_INPUT.description,
      category: FOUND_INPUT.category,
      location: FOUND_INPUT.location,
      eventDate: FOUND_INPUT.eventDate,
    });
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(matching.generateForPublication).toHaveBeenCalledWith(
      repository.manager,
      expect.objectContaining({
        type: 'FOUND',
        status: 'ACTIVE',
        searchText: 'texto normalizado',
      }),
    );
    expect(response).toMatchObject({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      type: 'FOUND',
      status: 'ACTIVE',
      ownerId: OWNER_ID,
      title: FOUND_INPUT.title,
      category: 'KEYS',
      eventDate: '2024-11-12',
    });
    expect(response.createdAt).toBe('2026-11-05T10:00:00.000Z');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls the publication transaction back when matching generation fails', async () => {
    const { service, matching, repository } = buildService();
    matching.generateForPublication.mockRejectedValueOnce(
      new Error('matching failed'),
    );

    await expect(
      service.createLostPublication(INPUT, OWNER_ID),
    ).rejects.toThrow('matching failed');
    expect(repository.manager.transaction).toHaveBeenCalledTimes(1);
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(matching.generateForPublication).toHaveBeenCalledTimes(1);
  });
});
