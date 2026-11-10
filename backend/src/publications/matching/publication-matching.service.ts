import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { MatchingConfig } from '../../config/env.validation';
import type { PublicationType } from '../domain/publication-status';
import { PublicationMatch } from './publication-match.entity';
import { Publication } from '../publication.entity';
import { toPublicationSummaryResponse } from '../publication-read-response';
import {
  scoreMatchingCandidate,
  selectMatchingSuggestions,
  type ScoredMatchingCandidate,
} from './matching-score';
import type { PublicationMatchesResponse } from './publication-matching-response';

const BACKFILL_BATCH_SIZE = 100;

export type MatchingSource = Pick<
  Publication,
  | 'id'
  | 'type'
  | 'status'
  | 'title'
  | 'description'
  | 'category'
  | 'location'
  | 'eventDate'
  | 'searchText'
>;

export interface MatchingCandidate {
  publication: Publication;
  textScore: number;
  locationScore: number;
  dateDifferenceDays: number;
}

function oppositeType(type: PublicationType): PublicationType {
  return type === 'LOST' ? 'FOUND' : 'LOST';
}

@Injectable()
export class PublicationMatchingService {
  constructor(
    @InjectRepository(Publication)
    private readonly publications: Repository<Publication>,
    @InjectRepository(PublicationMatch)
    private readonly matches: Repository<PublicationMatch>,
    private readonly config: ConfigService,
  ) {}

  async generateForPublication(
    manager: EntityManager,
    source: MatchingSource,
  ): Promise<ScoredMatchingCandidate[]> {
    if (source.status !== 'ACTIVE') {
      return [];
    }

    const matchingConfig = this.config.getOrThrow<MatchingConfig>('matching');
    const candidates = await this.findCandidates(manager, source);
    const suggestions = selectMatchingSuggestions(
      candidates.map((candidate) =>
        scoreMatchingCandidate(source, candidate, matchingConfig),
      ),
      matchingConfig,
    );

    for (const suggestion of suggestions) {
      const lostPublicationId =
        source.type === 'LOST' ? source.id : suggestion.candidate.publication.id;
      const foundPublicationId =
        source.type === 'FOUND' ? source.id : suggestion.candidate.publication.id;

      await manager.query(
        `
          INSERT INTO "publication_matches"
            ("lost_publication_id", "found_publication_id", "status", "score")
          VALUES ($1, $2, 'SUGGESTED', $3)
          ON CONFLICT ("lost_publication_id", "found_publication_id")
          DO UPDATE SET "score" = EXCLUDED."score", "updated_at" = now()
          WHERE "publication_matches"."status" = 'SUGGESTED'
        `,
        [lostPublicationId, foundPublicationId, suggestion.score.toFixed(4)],
      );
    }

    return suggestions;
  }

  async regenerateForPublication(
    manager: EntityManager,
    source: MatchingSource,
  ): Promise<ScoredMatchingCandidate[]> {
    await manager
      .createQueryBuilder()
      .delete()
      .from(PublicationMatch)
      .where(
        '(lost_publication_id = :publicationId OR found_publication_id = :publicationId)',
        { publicationId: source.id },
      )
      .andWhere('status = :status', { status: 'SUGGESTED' })
      .execute();

    return this.generateForPublication(manager, source);
  }

  async backfillActivePublications(): Promise<{
    publicationsProcessed: number;
    suggestionsGenerated: number;
  }> {
    let lastId: string | undefined;
    let publicationsProcessed = 0;
    let suggestionsGenerated = 0;

    while (true) {
      const sources = await this.publications.find({
        select: {
          id: true,
          type: true,
          status: true,
          title: true,
          description: true,
          category: true,
          location: true,
          eventDate: true,
          searchText: true,
        },
        where: lastId
          ? { status: 'ACTIVE', type: 'LOST', id: MoreThan(lastId) }
          : { status: 'ACTIVE', type: 'LOST' },
        order: { id: 'ASC' },
        take: BACKFILL_BATCH_SIZE,
      });

      if (sources.length === 0) {
        break;
      }

      for (const listedSource of sources) {
        const suggestions = await this.publications.manager.transaction(
          async (manager) => {
            const source = await manager.findOne(Publication, {
              select: {
                id: true,
                type: true,
                status: true,
                title: true,
                description: true,
                category: true,
                location: true,
                eventDate: true,
                searchText: true,
              },
              where: {
                id: listedSource.id,
                status: 'ACTIVE',
                type: 'LOST',
              },
            });

            return source ? this.generateForPublication(manager, source) : [];
          },
        );

        publicationsProcessed += 1;
        suggestionsGenerated += suggestions.length;
      }

      lastId = sources[sources.length - 1].id;
    }

    return { publicationsProcessed, suggestionsGenerated };
  }

  async getSuggestionsForPublication(
    publicationId: string,
  ): Promise<PublicationMatchesResponse> {
    const source = await this.publications.findOne({
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
        searchText: true,
      },
      where: { id: publicationId, status: 'ACTIVE' },
    });

    if (!source) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication not found',
      });
    }

    const matchingConfig = this.config.getOrThrow<MatchingConfig>('matching');
    const candidateJoin =
      source.type === 'LOST'
        ? 'candidate.id = match.foundPublicationId'
        : 'candidate.id = match.lostPublicationId';
    const sourceSide =
      source.type === 'LOST'
        ? 'match.lostPublicationId = :sourceId'
        : 'match.foundPublicationId = :sourceId';
    const textScore = `GREATEST(
      similarity(lower(:sourceTitle), lower(candidate.title)),
      similarity(lower(:sourceTitle), lower(candidate.description)),
      similarity(lower(:sourceDescription), lower(candidate.title)),
      similarity(lower(:sourceDescription), lower(candidate.description))
    )`;

    const rawMatches = await this.matches
      .createQueryBuilder('match')
      .innerJoin(
        Publication,
        'lostPublication',
        'lostPublication.id = match.lostPublicationId',
      )
      .innerJoin(
        Publication,
        'foundPublication',
        'foundPublication.id = match.foundPublicationId',
      )
      .innerJoin(Publication, 'candidate', candidateJoin)
      .select('match.id', 'match_id')
      .addSelect('match.status', 'match_status')
      .addSelect('match.score', 'match_score')
      .addSelect('candidate.id', 'candidate_id')
      .addSelect('candidate.type', 'candidate_type')
      .addSelect('candidate.status', 'candidate_status')
      .addSelect('candidate.title', 'candidate_title')
      .addSelect('candidate.description', 'candidate_description')
      .addSelect('candidate.category', 'candidate_category')
      .addSelect('candidate.location', 'candidate_location')
      .addSelect('candidate.eventDate', 'candidate_event_date')
      .addSelect('candidate.createdAt', 'candidate_created_at')
      .addSelect(textScore, 'match_text_score')
      .addSelect(
        'similarity(lower(:sourceLocation), lower(candidate.location))',
        'match_location_score',
      )
      .addSelect(
        'ABS(candidate.eventDate - CAST(:sourceEventDate AS date))',
        'match_date_difference_days',
      )
      .where('match.status = :suggestedStatus', {
        suggestedStatus: 'SUGGESTED',
      })
      .andWhere(sourceSide, { sourceId: publicationId })
      .andWhere('lostPublication.status = :activeStatus', {
        activeStatus: 'ACTIVE',
      })
      .andWhere('foundPublication.status = :activeStatus', {
        activeStatus: 'ACTIVE',
      })
      .andWhere('candidate.type = :oppositeType', {
        oppositeType: oppositeType(source.type),
      })
      .setParameters({
        sourceTitle: source.title,
        sourceDescription: source.description,
        sourceLocation: source.location,
        sourceEventDate: source.eventDate,
      })
      .orderBy('match.score', 'DESC')
      .addOrderBy('candidate.eventDate', 'DESC')
      .addOrderBy('candidate.id', 'ASC')
      .take(matchingConfig.maxSuggestions)
      .getRawMany<RawPublicationMatch>();

    const items = rawMatches.map((raw) => {
      const candidate = {
        id: raw.candidate_id,
        type: raw.candidate_type,
        status: raw.candidate_status,
        title: raw.candidate_title,
        description: raw.candidate_description,
        category: raw.candidate_category,
        location: raw.candidate_location,
        eventDate: raw.candidate_event_date,
        createdAt: raw.candidate_created_at,
      } as Publication;
      const scored = scoreMatchingCandidate(
        source,
        {
          publication: candidate,
          textScore: Number(raw.match_text_score),
          locationScore: Number(raw.match_location_score),
          dateDifferenceDays: Number(raw.match_date_difference_days),
        },
        matchingConfig,
      );

      return {
        id: raw.match_id,
        status: 'SUGGESTED' as const,
        candidate: toPublicationSummaryResponse(candidate),
        score: Number(raw.match_score),
        scoreBreakdown: scored.scoreBreakdown,
        eventDateDifferenceDays: Number(raw.match_date_difference_days),
      };
    });

    return { publicationId, items };
  }

  async findCandidates(
    manager: EntityManager,
    source: MatchingSource,
  ): Promise<MatchingCandidate[]> {
    const matchingConfig = this.config.getOrThrow<MatchingConfig>('matching');
    const { trigramThreshold, candidateLimit } = matchingConfig;

    await manager.query(
      `SELECT set_config('pg_trgm.similarity_threshold', $1, true)`,
      [String(trigramThreshold)],
    );

    const textScore = `GREATEST(
      similarity(lower(:sourceTitle), lower(candidate.title)),
      similarity(lower(:sourceTitle), lower(candidate.description)),
      similarity(lower(:sourceDescription), lower(candidate.title)),
      similarity(lower(:sourceDescription), lower(candidate.description))
    )`;
    const locationScore =
      'similarity(lower(:sourceLocation), lower(candidate.location))';
    const dateDifference =
      'ABS(candidate.eventDate - CAST(:sourceEventDate AS date))';

    const queryBuilder = manager
      .createQueryBuilder(Publication, 'candidate')
      .select([
        'candidate.id',
        'candidate.type',
        'candidate.status',
        'candidate.title',
        'candidate.description',
        'candidate.category',
        'candidate.location',
        'candidate.eventDate',
        'candidate.createdAt',
      ])
      .addSelect(textScore, 'match_text_score')
      .addSelect(locationScore, 'match_location_score')
      .addSelect(dateDifference, 'match_date_difference_days')
      .where('candidate.status = :activeStatus', {
        activeStatus: 'ACTIVE',
      })
      .andWhere('candidate.type = :oppositeType', {
        oppositeType: oppositeType(source.type),
      })
      .andWhere('candidate.id <> :sourceId', { sourceId: source.id })
      .andWhere('candidate.searchText % :sourceSearchText', {
        sourceSearchText: source.searchText,
      })
      .setParameters({
        sourceTitle: source.title,
        sourceDescription: source.description,
        sourceLocation: source.location,
        sourceEventDate: source.eventDate,
      })
      .orderBy('match_text_score', 'DESC')
      .addOrderBy('candidate.eventDate', 'DESC')
      .addOrderBy('candidate.id', 'ASC')
      .take(candidateLimit);

    const { entities, raw } = await queryBuilder.getRawAndEntities();

    return entities.map((publication, index) => ({
      publication,
      textScore: Number(raw[index].match_text_score),
      locationScore: Number(raw[index].match_location_score),
      dateDifferenceDays: Number(raw[index].match_date_difference_days),
    }));
  }
}

interface RawPublicationMatch {
  match_id: string;
  match_status: string;
  match_score: string | number;
  candidate_id: string;
  candidate_type: PublicationType;
  candidate_status: 'ACTIVE';
  candidate_title: string;
  candidate_description: string;
  candidate_category: Publication['category'];
  candidate_location: string;
  candidate_event_date: string;
  candidate_created_at: Date | string;
  match_text_score: string | number;
  match_location_score: string | number;
  match_date_difference_days: string | number;
}
