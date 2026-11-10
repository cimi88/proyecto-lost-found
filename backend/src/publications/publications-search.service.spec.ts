import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { PublicationQueryDto } from './dto/publication-query.dto';
import { Publication } from './publication.entity';
import { PublicationsService } from './publications.service';

const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_PUBLICATION_ID = '22222222-2222-4222-8222-222222222222';

function buildPublication(overrides: Partial<Publication> = {}): Publication {
  return {
    id: PUBLICATION_ID,
    type: 'LOST',
    status: 'ACTIVE',
    ownerId: '00000000-0000-4000-8000-000000000001',
    title: 'Bicicleta rodado 29',
    description: 'Bicicleta azul con canasto negro.',
    category: 'SPORTS',
    location: 'Plaza San Martín',
    eventDate: '2024-05-10',
    createdAt: new Date('2026-11-05T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T11:00:00.000Z'),
    searchText: 'bicicleta rodado 29 bicicleta azul con canasto negro plaza san martín',
    ...overrides,
  };
}

interface QueryBuilderMock {
  where: jest.Mock;
  andWhere: jest.Mock;
  addSelect: jest.Mock;
  setParameter: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  skip: jest.Mock;
  take: jest.Mock;
  getManyAndCount: jest.Mock;
}

interface ManagerMock {
  query: jest.Mock;
  createQueryBuilder: jest.Mock;
}

interface RepositoryMock {
  manager: { transaction: jest.Mock };
  findOne: jest.Mock;
}

function buildService(options: {
  items?: Publication[];
  total?: number;
} = {}): {
  service: PublicationsService;
  repository: RepositoryMock;
  manager: ManagerMock;
  queryBuilder: QueryBuilderMock;
} {
  const queryBuilder: QueryBuilderMock = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    setParameter: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn(async () => [
      options.items ?? [buildPublication()],
      options.total ?? 1,
    ]),
  };

  const manager: ManagerMock = {
    query: jest.fn(async () => [{ set_config: '0.15' }]),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };

  const repository: RepositoryMock = {
    manager: {
      transaction: jest.fn(async (callback: (m: ManagerMock) => unknown) =>
        callback(manager),
      ),
    },
    findOne: jest.fn(async () => buildPublication()),
  };

  return {
    service: new PublicationsService(
      repository as unknown as Repository<Publication>,
      { generateForPublication: jest.fn(async () => []) } as never,
    ),
    repository,
    manager,
    queryBuilder,
  };
}

function defaultQuery(
  overrides: Partial<PublicationQueryDto> = {},
): PublicationQueryDto {
  return {
    page: 1,
    pageSize: 12,
    ...overrides,
  };
}

describe('PublicationsService search and detail', () => {
  it('lists only ACTIVE publications with the fixed order and defaults', async () => {
    const { service, manager, queryBuilder } = buildService({ total: 13 });

    const response = await service.searchActivePublications(defaultQuery());

    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining(
        "set_config('pg_trgm.similarity_threshold', $1, true)",
      ),
      ['0.15'],
    );
    expect(manager.query.mock.invocationCallOrder[0]).toBeLessThan(
      manager.createQueryBuilder.mock.invocationCallOrder[0],
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'publication.status = :status',
      { status: 'ACTIVE' },
    );
    expect(queryBuilder.andWhere).not.toHaveBeenCalled();
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'publication.createdAt',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'publication.id',
      'DESC',
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(0);
    expect(queryBuilder.take).toHaveBeenCalledWith(12);
    expect(response).toEqual({
      items: [
        {
          id: PUBLICATION_ID,
          type: 'LOST',
          status: 'ACTIVE',
          title: 'Bicicleta rodado 29',
          description: 'Bicicleta azul con canasto negro.',
          category: 'SPORTS',
          location: 'Plaza San Martín',
          eventDate: '2024-05-10',
          createdAt: '2026-11-05T10:00:00.000Z',
        },
      ],
      page: 1,
      pageSize: 12,
      total: 13,
      totalPages: 2,
    });
    expect(response.items[0]).not.toHaveProperty('ownerId');
  });

  it('uses ILIKE and the trigram operator for a term of 3 characters or more', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(defaultQuery({ q: 'bici' }));

    const [sql, parameters] = queryBuilder.andWhere.mock.calls[0];

    expect(sql.match(/ILIKE/g)).toHaveLength(3);
    expect(sql.match(/ % :term/g)).toHaveLength(3);
    expect(parameters).toEqual({ like: '%bici%', term: 'bici' });
  });

  it('escapes backslashes, percent signs and underscores in the ILIKE pattern', async () => {
    const { service, queryBuilder } = buildService();
    const term = 'a%_\\b';

    await service.searchActivePublications(defaultQuery({ q: term }));

    const [, parameters] = queryBuilder.andWhere.mock.calls[0];

    expect(parameters).toEqual({
      like: '%a\\%\\_\\\\b%',
      term,
    });
  });

  it('omits the trigram branch for a term shorter than 3 characters', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(defaultQuery({ q: 'bi' }));

    const [sql, parameters] = queryBuilder.andWhere.mock.calls[0];

    expect(sql.match(/ILIKE/g)).toHaveLength(3);
    expect(sql).not.toContain(':term');
    expect(parameters).toEqual({ like: '%bi%' });
  });

  it('applies the requested pagination and calculates totalPages', async () => {
    const { service, queryBuilder } = buildService({ total: 11 });

    const response = await service.searchActivePublications(
      defaultQuery({ page: 3, pageSize: 5 }),
    );

    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
    expect(response).toMatchObject({
      page: 3,
      pageSize: 5,
      total: 11,
      totalPages: 3,
    });
  });

  it('returns totalPages 0 when there are no results', async () => {
    const { service } = buildService({ items: [], total: 0 });

    const response = await service.searchActivePublications(defaultQuery());

    expect(response).toMatchObject({
      items: [],
      total: 0,
      totalPages: 0,
    });
  });

  it('combines type, category and inclusive event date filters with AND', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(
      defaultQuery({
        type: 'FOUND',
        category: 'KEYS',
        eventDateFrom: '2024-01-01',
        eventDateTo: '2024-12-31',
      }),
    );

    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'publication.type = :type',
      { type: 'FOUND' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      'publication.category = :category',
      { category: 'KEYS' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      3,
      'publication.eventDate >= :eventDateFrom',
      { eventDateFrom: '2024-01-01' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      4,
      'publication.eventDate <= :eventDateTo',
      { eventDateTo: '2024-12-31' },
    );
  });

  it('combines filters with the CU3 search predicate', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(
      defaultQuery({ type: 'LOST', q: 'bici' }),
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledTimes(2);
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      1,
      'publication.type = :type',
      { type: 'LOST' },
    );
    expect(queryBuilder.andWhere).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('publication.title ILIKE :like'),
      { like: '%bici%', term: 'bici' },
    );
  });

  it('applies pagination after filtering', async () => {
    const { service, queryBuilder } = buildService({ total: 11 });

    const response = await service.searchActivePublications(
      defaultQuery({ type: 'LOST', page: 3, pageSize: 5 }),
    );

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'publication.type = :type',
      { type: 'LOST' },
    );
    expect(queryBuilder.skip).toHaveBeenCalledWith(10);
    expect(queryBuilder.take).toHaveBeenCalledWith(5);
    expect(response).toMatchObject({
      page: 3,
      pageSize: 5,
      total: 11,
      totalPages: 3,
    });
  });

  it('orders oldest first by createdAt and id ascending', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(defaultQuery({ sort: 'oldest' }));

    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'publication.createdAt',
      'ASC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenCalledWith(
      'publication.id',
      'ASC',
    );
  });

  it('orders by trigram relevance with recent and id tie-breakers', async () => {
    const { service, queryBuilder } = buildService();

    await service.searchActivePublications(
      defaultQuery({ q: 'bicicleta', sort: 'relevance' }),
    );

    const [selection, alias] = queryBuilder.addSelect.mock.calls[0];

    expect(selection).toContain('GREATEST');
    expect(selection).toContain(
      'similarity(publication.title, :relevanceTerm)',
    );
    expect(selection).toContain(
      'similarity(publication.description, :relevanceTerm)',
    );
    expect(selection).toContain(
      'similarity(publication.location, :relevanceTerm)',
    );
    expect(alias).toBe('relevance_score');
    expect(queryBuilder.setParameter).toHaveBeenCalledWith(
      'relevanceTerm',
      'bicicleta',
    );
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'relevance_score',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'publication.createdAt',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'publication.id',
      'DESC',
    );
  });

  it.each([undefined, '', '   '])(
    'rejects relevance without a search term (%p)',
    async (q) => {
      const { service, repository } = buildService();

      const error = await service
        .searchActivePublications(defaultQuery({ q, sort: 'relevance' }))
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(BadRequestException);
      expect((error as BadRequestException).getResponse()).toEqual({
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: [
          {
            field: 'sort',
            message: 'El orden por relevancia requiere un término de búsqueda.',
          },
        ],
      });
      expect(repository.manager.transaction).not.toHaveBeenCalled();
    },
  );

  it('rejects an event date range whose end precedes its start', async () => {
    const { service, repository } = buildService();

    const error = await service
      .searchActivePublications(
        defaultQuery({
          eventDateFrom: '2024-12-31',
          eventDateTo: '2024-01-01',
        }),
      )
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [
        {
          field: 'eventDateTo',
          message: 'La fecha final no puede ser anterior a la fecha inicial.',
        },
      ],
    });
    expect(repository.manager.transaction).not.toHaveBeenCalled();
  });

  it('returns the detail of an ACTIVE publication without ownerId', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValueOnce(buildPublication());

    const response = await service.findActivePublicationById(PUBLICATION_ID);

    expect(repository.findOne).toHaveBeenCalledWith({
      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        description: true,
        category: true,
        location: true,
        eventDate: true,
        createdAt: true,
        updatedAt: true,
      },
      where: { id: PUBLICATION_ID, status: 'ACTIVE' },
    });
    expect(repository.findOne.mock.calls[0][0].select).not.toHaveProperty(
      'ownerId',
    );
    expect(response).toEqual({
      id: PUBLICATION_ID,
      type: 'LOST',
      status: 'ACTIVE',
      title: 'Bicicleta rodado 29',
      description: 'Bicicleta azul con canasto negro.',
      category: 'SPORTS',
      location: 'Plaza San Martín',
      eventDate: '2024-05-10',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-06T11:00:00.000Z',
    });
    expect(response).not.toHaveProperty('ownerId');
  });

  it('throws PUBLICATION_NOT_FOUND when the publication is absent or not ACTIVE', async () => {
    const { service, repository } = buildService();
    repository.findOne.mockResolvedValueOnce(null);

    const error = await service
      .findActivePublicationById(OTHER_PUBLICATION_ID)
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(NotFoundException);
    expect((error as NotFoundException).getResponse()).toEqual({
      statusCode: 404,
      code: 'PUBLICATION_NOT_FOUND',
      message: 'Publication not found',
    });
  });
});
