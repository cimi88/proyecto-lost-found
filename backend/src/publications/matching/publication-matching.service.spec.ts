import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';
import { DEFAULT_MATCHING_CONFIG } from '../../config/env.validation';
import { Publication } from '../publication.entity';
import { PublicationMatch } from './publication-match.entity';
import {
  PublicationMatchingService,
  type MatchingSource,
} from './publication-matching.service';

const SOURCE: MatchingSource = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'LOST',
  status: 'ACTIVE',
  title: 'Billetera negra',
  description: 'Billetera de cuero con tarjetas.',
  category: 'BAGS',
  location: 'Plaza Central',
  eventDate: '2026-11-01',
  searchText: 'billetera negra billetera de cuero con tarjetas plaza central',
};

function buildCandidatePublication(
  overrides: Partial<Publication> = {},
): Publication {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    type: 'FOUND',
    status: 'ACTIVE',
    ownerId: '00000000-0000-4000-8000-000000000002',
    title: 'Billetera negra encontrada',
    description: 'Billetera de cuero con tarjetas encontradas.',
    category: 'BAGS',
    location: 'Plaza Central',
    eventDate: '2026-11-01',
    createdAt: new Date('2026-11-06T10:00:00.000Z'),
    updatedAt: new Date('2026-11-06T10:00:00.000Z'),
    searchText: 'billetera negra encontrada',
    ...overrides,
  };
}

describe('PublicationMatchingService.findCandidates', () => {
  let queryBuilder: {
    select: jest.Mock;
    addSelect: jest.Mock;
    delete: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    andWhere: jest.Mock;
    setParameters: jest.Mock;
    orderBy: jest.Mock;
    addOrderBy: jest.Mock;
    take: jest.Mock;
    execute: jest.Mock;
    getRawAndEntities: jest.Mock;
  };
  let manager: {
    query: jest.Mock;
    createQueryBuilder: jest.Mock;
    transaction: jest.Mock;
    findOne: jest.Mock;
  };
  let publications: {
    manager: typeof manager;
    find: jest.Mock;
  };
  let service: PublicationMatchingService;

  beforeEach(() => {
    queryBuilder = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      setParameters: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => ({ affected: 1 })),
      getRawAndEntities: jest.fn(async () => ({ entities: [], raw: [] })),
    };
    manager = {
      query: jest.fn(async () => [{ set_config: '0.15' }]),
      createQueryBuilder: jest.fn(() => queryBuilder),
      transaction: jest.fn(
        async (callback: (transactionManager: typeof manager) => unknown) =>
          callback(manager),
      ),
      findOne: jest.fn(),
    };
    publications = {
      manager,
      find: jest.fn(async () => []),
    };
    const matches = {} as Repository<PublicationMatch>;
    const config = {
      getOrThrow: jest.fn(() => DEFAULT_MATCHING_CONFIG),
    } as unknown as ConfigService;

    service = new PublicationMatchingService(
      publications as unknown as Repository<Publication>,
      matches,
      config,
    );
  });

  it('sets the trigram threshold locally and prefilters opposite ACTIVE publications', async () => {
    await service.findCandidates(manager as unknown as EntityManager, SOURCE);

    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('pg_trgm.similarity_threshold', $1, true)",
      ['0.15'],
    );
    expect(queryBuilder.where).toHaveBeenCalledWith(
      'candidate.status = :activeStatus',
      { activeStatus: 'ACTIVE' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.type = :oppositeType',
      { oppositeType: 'FOUND' },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.id <> :sourceId',
      { sourceId: SOURCE.id },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.searchText % :sourceSearchText',
      { sourceSearchText: SOURCE.searchText },
    );
  });

  it('removes stale suggested pairs and regenerates suggestions for an edited publication', async () => {
    await service.regenerateForPublication(
      manager as unknown as EntityManager,
      SOURCE,
    );

    expect(queryBuilder.delete).toHaveBeenCalledTimes(1);
    expect(queryBuilder.from).toHaveBeenCalledWith(PublicationMatch);
    expect(queryBuilder.where).toHaveBeenCalledWith(
      '(lost_publication_id = :publicationId OR found_publication_id = :publicationId)',
      { publicationId: SOURCE.id },
    );
    expect(queryBuilder.andWhere).toHaveBeenCalledWith('status = :status', {
      status: 'SUGGESTED',
    });
    expect(queryBuilder.execute).toHaveBeenCalledTimes(1);
    expect(manager.query).toHaveBeenCalledWith(
      "SELECT set_config('pg_trgm.similarity_threshold', $1, true)",
      ['0.15'],
    );
  });

  it('searches LOST candidates when the source is FOUND', async () => {
    await service.findCandidates(manager as unknown as EntityManager, {
      ...SOURCE,
      type: 'FOUND',
    });

    expect(queryBuilder.andWhere).toHaveBeenCalledWith(
      'candidate.type = :oppositeType',
      { oppositeType: 'LOST' },
    );
  });

  it('does not apply category as an eligibility predicate and applies deterministic limits', async () => {
    await service.findCandidates(manager as unknown as EntityManager, SOURCE);

    expect(
      queryBuilder.andWhere.mock.calls.some(([sql]: [string]) =>
        sql.includes('candidate.category'),
      ),
    ).toBe(false);
    expect(queryBuilder.orderBy).toHaveBeenCalledWith(
      'match_text_score',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      1,
      'candidate.eventDate',
      'DESC',
    );
    expect(queryBuilder.addOrderBy).toHaveBeenNthCalledWith(
      2,
      'candidate.id',
      'ASC',
    );
    expect(queryBuilder.take).toHaveBeenCalledWith(500);
  });

  it('selects only public candidate fields and computes text, location, and date signals', async () => {
    await service.findCandidates(manager as unknown as EntityManager, SOURCE);

    expect(queryBuilder.select).toHaveBeenCalledWith([
      'candidate.id',
      'candidate.type',
      'candidate.status',
      'candidate.title',
      'candidate.description',
      'candidate.category',
      'candidate.location',
      'candidate.eventDate',
      'candidate.createdAt',
    ]);
    expect(queryBuilder.addSelect.mock.calls[0][0]).toContain('GREATEST');
    expect(queryBuilder.addSelect.mock.calls[0][0]).toContain(
      'similarity(lower(:sourceDescription), lower(candidate.description))',
    );
    expect(queryBuilder.addSelect.mock.calls[1][0]).toContain(
      'similarity(lower(:sourceLocation), lower(candidate.location))',
    );
    expect(queryBuilder.addSelect.mock.calls[2][0]).toContain(
      'candidate.eventDate - CAST(:sourceEventDate AS date)',
    );
    expect(queryBuilder.select.mock.calls.flat().join(' ')).not.toContain(
      'ownerId',
    );
  });

  it('persists the canonical LOST/FOUND pair with score and keeps terminal states closed on conflict', async () => {
    queryBuilder.getRawAndEntities.mockResolvedValueOnce({
      entities: [buildCandidatePublication()],
      raw: [
        {
          match_text_score: '0.8',
          match_location_score: '0.6',
          match_date_difference_days: '1',
        },
      ],
    });

    const suggestions = await service.generateForPublication(
      manager as unknown as EntityManager,
      SOURCE,
    );

    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].score).toBe(0.835);
    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'ON CONFLICT ("lost_publication_id", "found_publication_id")',
      ),
      [SOURCE.id, '22222222-2222-4222-8222-222222222222', '0.8350'],
    );
    expect(manager.query.mock.calls[1][0]).toContain(
      'WHERE "publication_matches"."status" = \'SUGGESTED\'',
    );
  });

  it('stores the source as FOUND and the candidate as LOST for reverse matching', async () => {
    queryBuilder.getRawAndEntities.mockResolvedValueOnce({
      entities: [buildCandidatePublication({ type: 'LOST' })],
      raw: [
        {
          match_text_score: '0.8',
          match_location_score: '0.6',
          match_date_difference_days: '0',
        },
      ],
    });

    await service.generateForPublication(manager as unknown as EntityManager, {
      ...SOURCE,
      type: 'FOUND',
    });

    expect(manager.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "publication_matches"'),
      ['22222222-2222-4222-8222-222222222222', SOURCE.id, '0.8400'],
    );
  });

  it('does not persist candidates below the suggestion threshold', async () => {
    queryBuilder.getRawAndEntities.mockResolvedValueOnce({
      entities: [buildCandidatePublication({ category: 'KEYS' })],
      raw: [
        {
          match_text_score: '0.2',
          match_location_score: '0',
          match_date_difference_days: '30',
        },
      ],
    });

    const suggestions = await service.generateForPublication(
      manager as unknown as EntityManager,
      SOURCE,
    );

    expect(suggestions).toEqual([]);
    expect(manager.query).toHaveBeenCalledTimes(1);
  });

  it('backfills active publications in stable keyset pages and is safe to rerun', async () => {
    const sourcePublication = {
      ...SOURCE,
      createdAt: new Date('2026-11-06T10:00:00.000Z'),
      updatedAt: new Date('2026-11-06T10:00:00.000Z'),
    } as Publication;
    const foundCandidate = buildCandidatePublication();
    publications.find
      .mockResolvedValueOnce([sourcePublication])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sourcePublication])
      .mockResolvedValueOnce([]);
    manager.findOne.mockResolvedValue(sourcePublication);
    queryBuilder.getRawAndEntities.mockResolvedValue({
      entities: [foundCandidate],
      raw: [
        {
          match_text_score: '0.8',
          match_location_score: '0.6',
          match_date_difference_days: '1',
        },
      ],
    });

    const firstRun = await service.backfillActivePublications();
    const secondRun = await service.backfillActivePublications();

    expect(firstRun).toEqual({ publicationsProcessed: 1, suggestionsGenerated: 1 });
    expect(secondRun).toEqual({ publicationsProcessed: 1, suggestionsGenerated: 1 });
    expect(publications.find).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { status: 'ACTIVE', type: 'LOST' },
        order: { id: 'ASC' },
        take: 100,
      }),
    );
    expect(publications.find).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        where: { status: 'ACTIVE', type: 'LOST' },
        order: { id: 'ASC' },
        take: 100,
      }),
    );
    expect(manager.transaction).toHaveBeenCalledTimes(2);
    expect(manager.query).toHaveBeenCalledTimes(4);
    expect(manager.query.mock.calls[1][0]).toContain('ON CONFLICT');
    expect(manager.query.mock.calls[3][0]).toContain('ON CONFLICT');
  });
});
