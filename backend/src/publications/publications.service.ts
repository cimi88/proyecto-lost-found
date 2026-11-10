import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Not } from 'typeorm';
import type { EntityManager, Repository } from 'typeorm';
import type { AuthenticatedUser } from '../identity/identity.types';
import { RecoveryRequest } from '../recovery-requests/recovery-request.entity';
import {
  DEFAULT_PUBLICATION_SORT,
  type PublicationSort,
} from './domain/publication-sort';
import type { PublicationType } from './domain/publication-status';
import type { CreateFoundPublicationDto } from './dto/create-found-publication.dto';
import type { CreateLostPublicationDto } from './dto/create-lost-publication.dto';
import type { CreatePublicationDto } from './dto/create-publication.dto';
import type { PublicationQueryDto } from './dto/publication-query.dto';
import {
  toFoundPublicationResponse,
  type FoundPublicationResponse,
} from './found-publication-response';
import {
  toLostPublicationResponse,
  type LostPublicationResponse,
} from './lost-publication-response';
import {
  toPublicationDetailResponse,
  toPublicationSummaryResponse,
  type PublicationDetailResponse,
  type PublicationSearchResponse,
} from './publication-read-response';
import {
  toOwnPublicationResponse,
  type OwnPublicationResponse,
} from './publication-own-response';
import { Publication } from './publication.entity';
import { PublicationMatchingService } from './matching/publication-matching.service';

const TRIGRAM_SIMILARITY_THRESHOLD = '0.15';
const MIN_TRIGRAM_TERM_LENGTH = 3;

const OWN_PUBLICATION_SELECT = {
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
} as const;

const MATCHING_SOURCE_SELECT = {
  ...OWN_PUBLICATION_SELECT,
  searchText: true,
} as const;

function escapeLikePattern(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/%/g, '\\%')
    .replace(/_/g, '\\_');
}

@Injectable()
export class PublicationsService {
  constructor(
    @InjectRepository(Publication)
    private readonly publications: Repository<Publication>,
    private readonly publicationMatching: PublicationMatchingService,
  ) {}

  async createLostPublication(
    input: CreateLostPublicationDto,
    ownerId: string,
  ): Promise<LostPublicationResponse> {
    const saved = await this.persistPublication('LOST', input, ownerId);

    return toLostPublicationResponse(saved);
  }

  async createFoundPublication(
    input: CreateFoundPublicationDto,
    ownerId: string,
  ): Promise<FoundPublicationResponse> {
    const saved = await this.persistPublication('FOUND', input, ownerId);

    return toFoundPublicationResponse(saved);
  }

  async searchActivePublications(
    query: PublicationQueryDto,
  ): Promise<PublicationSearchResponse> {
    const { page, pageSize } = query;
    const { term, sort } = this.normalizeSearchQuery(query);

    const { items, total } = await this.publications.manager.transaction(
      async (manager) => {
        await manager.query(
          `SELECT set_config('pg_trgm.similarity_threshold', $1, true)`,
          [TRIGRAM_SIMILARITY_THRESHOLD],
        );

        const queryBuilder = manager
          .createQueryBuilder(Publication, 'publication')
          .where('publication.status = :status', { status: 'ACTIVE' });

        if (query.type) {
          queryBuilder.andWhere('publication.type = :type', {
            type: query.type,
          });
        }

        if (query.category) {
          queryBuilder.andWhere('publication.category = :category', {
            category: query.category,
          });
        }

        if (query.eventDateFrom) {
          queryBuilder.andWhere(
            'publication.eventDate >= :eventDateFrom',
            { eventDateFrom: query.eventDateFrom },
          );
        }

        if (query.eventDateTo) {
          queryBuilder.andWhere('publication.eventDate <= :eventDateTo', {
            eventDateTo: query.eventDateTo,
          });
        }

        if (term) {
          const predicates = [
            'publication.title ILIKE :like',
            'publication.description ILIKE :like',
            'publication.location ILIKE :like',
          ];

          if (term.length >= MIN_TRIGRAM_TERM_LENGTH) {
            predicates.push(
              'publication.title % :term',
              'publication.description % :term',
              'publication.location % :term',
            );
          }

          queryBuilder.andWhere(`(${predicates.join(' OR ')})`, {
            like: `%${escapeLikePattern(term)}%`,
            ...(term.length >= MIN_TRIGRAM_TERM_LENGTH ? { term } : {}),
          });
        }

        if (sort === 'oldest') {
          queryBuilder
            .orderBy('publication.createdAt', 'ASC')
            .addOrderBy('publication.id', 'ASC');
        } else if (sort === 'relevance' && term) {
          queryBuilder
            .addSelect(
              'GREATEST(similarity(publication.title, :relevanceTerm), similarity(publication.description, :relevanceTerm), similarity(publication.location, :relevanceTerm))',
              'relevance_score',
            )
            .setParameter('relevanceTerm', term)
            .orderBy('relevance_score', 'DESC')
            .addOrderBy('publication.createdAt', 'DESC')
            .addOrderBy('publication.id', 'DESC');
        } else {
          queryBuilder
            .orderBy('publication.createdAt', 'DESC')
            .addOrderBy('publication.id', 'DESC');
        }

        const [publications, count] = await queryBuilder
          .skip((page - 1) * pageSize)
          .take(pageSize)
          .getManyAndCount();

        return { items: publications, total: count };
      },
    );

    return {
      items: items.map(toPublicationSummaryResponse),
      page,
      pageSize,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / pageSize),
    };
  }

  async findActivePublicationById(
    id: string,
  ): Promise<PublicationDetailResponse> {
    const publication = await this.publications.findOne({
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
      where: { id, status: 'ACTIVE' },
    });

    if (!publication) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication not found',
      });
    }

    return toPublicationDetailResponse(publication);
  }

  async findActivePublicationsForAdmin(
    actor: AuthenticatedUser,
  ): Promise<OwnPublicationResponse[]> {
    if (actor.role !== 'ADMIN') {
      throw this.adminForbidden();
    }

    const publications = await this.publications.find({
      select: OWN_PUBLICATION_SELECT,
      where: {
        status: 'ACTIVE',
        ownerId: Not(actor.id),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return publications.map(toOwnPublicationResponse);
  }

  async findMine(ownerId: string): Promise<OwnPublicationResponse[]> {
    const publications = await this.publications.find({
      select: OWN_PUBLICATION_SELECT,
      where: { ownerId },
      order: { createdAt: 'DESC', id: 'DESC' },
    });

    return publications.map(toOwnPublicationResponse);
  }

  async findMineById(
    id: string,
    ownerId: string,
  ): Promise<OwnPublicationResponse> {
    const publication = await this.publications.findOne({
      select: OWN_PUBLICATION_SELECT,
      where: { id, ownerId },
    });

    if (!publication) {
      throw this.publicationNotFound();
    }

    return toOwnPublicationResponse(publication);
  }

  async updateOwnPublication(
    id: string,
    input: CreatePublicationDto,
    ownerId: string,
  ): Promise<OwnPublicationResponse> {
    return this.publications.manager.transaction(async (manager) => {
      const publication = await manager.findOne(Publication, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!publication || publication.ownerId !== ownerId) {
        throw this.publicationNotFound();
      }

      if (publication.status !== 'ACTIVE') {
        throw this.notEditable();
      }

      const update = await manager.update(
        Publication,
        { id, ownerId, status: 'ACTIVE' },
        {
          title: input.title,
          description: input.description,
          category: input.category,
          location: input.location,
          eventDate: input.eventDate,
        },
      );

      if (update.affected !== 1) {
        throw this.notEditable();
      }

      const updated = await manager.findOne(Publication, {
        select: MATCHING_SOURCE_SELECT,
        where: { id, ownerId },
      });

      if (!updated) {
        throw this.publicationNotFound();
      }

      await this.publicationMatching.regenerateForPublication(manager, updated);

      return toOwnPublicationResponse(updated);
    });
  }

  async closePublication(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OwnPublicationResponse> {
    return this.publications.manager.transaction(async (manager) => {
      const publication = await manager.findOne(Publication, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      const isOwner = publication?.ownerId === actor.id;
      const isAdminModerator =
        actor.role === 'ADMIN' &&
        publication !== null &&
        publication.ownerId !== actor.id;

      if (!publication || (!isOwner && !isAdminModerator)) {
        throw this.publicationNotFound();
      }

      if (publication.status !== 'ACTIVE') {
        throw this.notClosable();
      }

      const activeRequests = await manager.find(RecoveryRequest, {
        where: {
          publicationId: id,
          status: In(['PENDING', 'APPROVED']),
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (activeRequests.length > 0) {
        throw this.hasActiveRequests();
      }

      const update = await manager.update(
        Publication,
        { id, ownerId: publication.ownerId, status: 'ACTIVE' },
        { status: 'CLOSED' },
      );

      if (update.affected !== 1) {
        throw this.notClosable();
      }

      const closed = await manager.findOne(Publication, {
        select: OWN_PUBLICATION_SELECT,
        where: { id },
      });

      if (!closed) {
        throw this.publicationNotFound();
      }

      return toOwnPublicationResponse(closed);
    });
  }

  private normalizeSearchQuery(query: PublicationQueryDto): {
    term?: string;
    sort: PublicationSort;
  } {
    const term = query.q?.trim();
    const sort = query.sort ?? DEFAULT_PUBLICATION_SORT;

    if (sort === 'relevance' && !term) {
      throw this.validationError(
        'sort',
        'El orden por relevancia requiere un término de búsqueda.',
      );
    }

    if (
      query.eventDateFrom &&
      query.eventDateTo &&
      query.eventDateFrom > query.eventDateTo
    ) {
      throw this.validationError(
        'eventDateTo',
        'La fecha final no puede ser anterior a la fecha inicial.',
      );
    }

    return { term, sort };
  }

  private validationError(field: string, message: string): BadRequestException {
    return new BadRequestException({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: [{ field, message }],
    });
  }

  private publicationNotFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: 'PUBLICATION_NOT_FOUND',
      message: 'Publication not found',
    });
  }

  private notEditable(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'PUBLICATION_NOT_EDITABLE',
      message: 'Only active publications can be edited',
    });
  }

  private notClosable(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'PUBLICATION_NOT_CLOSABLE',
      message: 'Only active publications can be closed',
    });
  }

  private hasActiveRequests(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'PUBLICATION_HAS_ACTIVE_REQUESTS',
      message: 'The publication has pending or approved recovery requests',
    });
  }

  private adminForbidden(): ForbiddenException {
    return new ForbiddenException({
      statusCode: 403,
      code: 'ADMIN_FORBIDDEN',
      message: 'The authenticated user is not an administrator',
    });
  }

  private async persistPublication(
    type: PublicationType,
    input: CreatePublicationDto,
    ownerId: string,
  ): Promise<Publication> {
    return this.publications.manager.transaction(
      async (manager: EntityManager) => {
        const publication = manager.create(Publication, {
          id: randomUUID(),
          type,
          status: 'ACTIVE',
          ownerId,
          title: input.title,
          description: input.description,
          category: input.category,
          location: input.location,
          eventDate: input.eventDate,
        });
        const saved = await manager.save(Publication, publication);
        const matchingSource = await manager.findOne(Publication, {
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
          where: { id: saved.id, status: 'ACTIVE' },
        });

        if (!matchingSource) {
          throw new Error('Created publication could not be reloaded for matching');
        }

        await this.publicationMatching.generateForPublication(
          manager,
          matchingSource,
        );

        return saved;
      },
    );
  }
}
