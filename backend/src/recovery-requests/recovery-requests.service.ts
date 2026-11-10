import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In } from 'typeorm';
import type { EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import type { AuthenticatedUser } from '../identity/identity.types';
import { User } from '../identity/user.entity';
import { Publication } from '../publications/publication.entity';
import type { CancelRecoveryRequestDto } from './dto/cancel-recovery-request.dto';
import type { CompleteRecoveryRequestDto } from './dto/complete-recovery-request.dto';
import type { CreateRecoveryRequestDto } from './dto/create-recovery-request.dto';
import { RecoveryRequest } from './recovery-request.entity';
import {
  toRecoveryRequestResponse,
  type RawRecoveryRequestResponse,
  type RecoveryRequestResponse,
} from './recovery-request-response';

function isUniqueViolation(error: unknown): boolean {
  const directCode = (error as { code?: unknown }).code;
  const driverCode = (
    error as { driverError?: { code?: unknown } } | undefined
  )?.driverError?.code;

  return directCode === '23505' || driverCode === '23505';
}

@Injectable()
export class RecoveryRequestsService {
  constructor(
    @InjectRepository(RecoveryRequest)
    private readonly requests: Repository<RecoveryRequest>,
  ) {}

  async create(
    publicationId: string,
    input: CreateRecoveryRequestDto,
    requester: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    try {
      return await this.requests.manager.transaction(async (manager) => {
        const publication = await manager.findOne(Publication, {
          where: { id: publicationId },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !publication ||
          publication.type !== 'FOUND' ||
          publication.status !== 'ACTIVE'
        ) {
          throw this.publicationNotFound();
        }

        if (publication.ownerId === requester.id) {
          throw this.forbidden();
        }

        const duplicate = await manager.findOne(RecoveryRequest, {
          where: {
            publicationId,
            requesterId: requester.id,
            status: In(['PENDING', 'APPROVED']),
          },
        });

        if (duplicate) {
          throw this.duplicate();
        }

        const created = manager.create(RecoveryRequest, {
          publicationId,
          requesterId: requester.id,
          status: 'PENDING',
          notes: input.notes?.trim() || null,
          cancelledById: null,
          cancellationReason: null,
        });
        const saved = await manager.save(RecoveryRequest, created);

        return this.findResponseById(manager, saved.id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw this.duplicate();
      }

      throw error;
    }
  }

  async findMine(userId: string): Promise<RecoveryRequestResponse[]> {
    return this.listResponses((query) =>
      query.where('request.requesterId = :userId', { userId }),
    );
  }

  async findReceived(
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse[]> {
    return this.listResponses((query) =>
      query.where('publication.ownerId = :userId', { userId: actor.id }),
    );
  }

  async approve(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    try {
      return await this.requests.manager.transaction(async (manager) => {
        const reference = await manager.findOne(RecoveryRequest, {
          select: { id: true, publicationId: true },
          where: { id },
        });

        if (!reference) {
          throw this.requestNotFound();
        }

        const publication = await manager.findOne(Publication, {
          where: { id: reference.publicationId },
          lock: { mode: 'pessimistic_write' },
        });

        if (
          !publication ||
          publication.type !== 'FOUND' ||
          publication.status !== 'ACTIVE'
        ) {
          throw this.publicationNotFound();
        }

        const request = await manager.findOne(RecoveryRequest, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });

        if (!request) {
          throw this.requestNotFound();
        }

        if (publication.ownerId !== actor.id) {
          throw this.forbidden();
        }

        if (request.status !== 'PENDING') {
          throw this.notPending();
        }

        const alreadyApproved = await manager.findOne(RecoveryRequest, {
          where: {
            publicationId: publication.id,
            status: 'APPROVED',
          },
          lock: { mode: 'pessimistic_write' },
        });

        if (alreadyApproved) {
          throw this.conflict(
            'The publication already has an approved recovery request.',
          );
        }

        await manager.update(
          RecoveryRequest,
          { id: request.id },
          { status: 'APPROVED' },
        );
        await manager.update(
          Publication,
          { id: publication.id },
          { status: 'RESERVED' },
        );
        await manager
          .createQueryBuilder()
          .update(RecoveryRequest)
          .set({ status: 'REJECTED' })
          .where('publication_id = :publicationId', {
            publicationId: publication.id,
          })
          .andWhere('status = :pending', { pending: 'PENDING' })
          .andWhere('id <> :requestId', { requestId: request.id })
          .execute();

        return this.findResponseById(manager, request.id);
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw this.conflict(
          'The publication already has an approved recovery request.',
        );
      }

      throw error;
    }
  }

  async reject(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    return this.requests.manager.transaction(async (manager) => {
      const request = await manager.findOne(RecoveryRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw this.requestNotFound();
      }

      const publication = await manager.findOne(Publication, {
        where: { id: request.publicationId },
      });

      if (!publication) {
        throw this.publicationNotFound();
      }

      if (publication.ownerId !== actor.id) {
        throw this.forbidden();
      }

      if (request.status !== 'PENDING') {
        throw this.notPending();
      }

      await manager.update(
        RecoveryRequest,
        { id: request.id },
        { status: 'REJECTED' },
      );

      return this.findResponseById(manager, request.id);
    });
  }

  async complete(
    id: string,
    input: CompleteRecoveryRequestDto,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    const returnNotes = input.returnNotes?.trim() || null;

    return this.requests.manager.transaction(async (manager) => {
      const reference = await manager.findOne(RecoveryRequest, {
        select: { id: true, publicationId: true },
        where: { id },
      });

      if (!reference) {
        throw this.requestNotFound();
      }

      const publication = await manager.findOne(Publication, {
        where: { id: reference.publicationId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!publication) {
        throw this.publicationNotFound();
      }

      const request = await manager.findOne(RecoveryRequest, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });

      if (!request) {
        throw this.requestNotFound();
      }

      const canComplete = publication.ownerId === actor.id;

      if (!canComplete) {
        throw this.forbidden();
      }

      if (request.status === 'COMPLETED') {
        throw this.alreadyCompleted();
      }

      if (request.status !== 'APPROVED') {
        throw this.notApproved();
      }

      if (
        publication.type !== 'FOUND' ||
        publication.status !== 'RESERVED'
      ) {
        throw this.conflict(
          'The publication is not reserved for the approved recovery request.',
        );
      }

      const approvedRequests = await manager.find(RecoveryRequest, {
        where: { publicationId: publication.id, status: 'APPROVED' },
        lock: { mode: 'pessimistic_write' },
      });

      if (
        approvedRequests.length !== 1 ||
        approvedRequests[0].id !== request.id
      ) {
        throw this.conflict(
          'The reservation does not match the approved recovery request.',
        );
      }

      const requestUpdate = await manager.update(
        RecoveryRequest,
        { id: request.id, status: 'APPROVED' },
        {
          status: 'COMPLETED',
          completedAt: new Date(),
          completedById: actor.id,
          returnNotes,
        },
      );

      if (requestUpdate.affected !== 1) {
        throw this.alreadyCompleted();
      }

      const publicationUpdate = await manager.update(
        Publication,
        { id: publication.id, status: 'RESERVED' },
        { status: 'RETURNED' },
      );

      if (publicationUpdate.affected !== 1) {
        throw this.conflict(
          'The publication could not be marked as returned.',
        );
      }

      return this.findResponseById(manager, request.id);
    });
  }

  async cancel(
    id: string,
    input: CancelRecoveryRequestDto,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    const reason = input.reason.trim();

    return this.requests.manager.transaction(async (manager) => {
      const reference = await manager.findOne(RecoveryRequest, {
        select: { id: true, publicationId: true, status: true },
        where: { id },
      });

      if (!reference) {
        throw this.requestNotFound();
      }

      if (
        reference.status === 'REJECTED' ||
        reference.status === 'CANCELLED' ||
        reference.status === 'COMPLETED'
      ) {
        throw this.notCancellable();
      }

      if (reference.status === 'APPROVED') {
        return this.cancelApproved(manager, id, reason, actor);
      }

      if (reference.status === 'PENDING') {
        return this.cancelPending(manager, id, reason, actor);
      }

      throw this.notCancellable();
    });
  }

  private async cancelPending(
    manager: EntityManager,
    id: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    const request = await manager.findOne(RecoveryRequest, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!request) {
      throw this.requestNotFound();
    }

    if (request.status !== 'PENDING') {
      throw this.notCancellable();
    }

    if (request.requesterId !== actor.id) {
      throw this.forbidden();
    }

    await manager.update(
      RecoveryRequest,
      { id: request.id },
      {
        status: 'CANCELLED',
        cancelledById: actor.id,
        cancellationReason: reason,
      },
    );

    return this.findResponseById(manager, request.id);
  }

  private async cancelApproved(
    manager: EntityManager,
    id: string,
    reason: string,
    actor: AuthenticatedUser,
  ): Promise<RecoveryRequestResponse> {
    const reference = await manager.findOne(RecoveryRequest, {
      select: { id: true, publicationId: true },
      where: { id },
    });

    if (!reference) {
      throw this.requestNotFound();
    }

    const publication = await manager.findOne(Publication, {
      where: { id: reference.publicationId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!publication) {
      throw this.publicationNotFound();
    }

    const request = await manager.findOne(RecoveryRequest, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });

    if (!request) {
      throw this.requestNotFound();
    }

    if (request.status !== 'APPROVED') {
      throw this.notCancellable();
    }

    const canCancel =
      request.requesterId === actor.id ||
      publication.ownerId === actor.id;

    if (!canCancel) {
      throw this.forbidden();
    }

    if (publication.status !== 'RESERVED') {
      throw this.conflict(
        'The publication is not reserved for the approved recovery request.',
      );
    }

    const approvedRequests = await manager.find(RecoveryRequest, {
      where: { publicationId: publication.id, status: 'APPROVED' },
      lock: { mode: 'pessimistic_write' },
    });

    if (
      approvedRequests.length !== 1 ||
      approvedRequests[0].id !== request.id
    ) {
      throw this.conflict(
        'The reservation does not match the approved recovery request.',
      );
    }

    await manager.update(
      RecoveryRequest,
      { id: request.id },
      {
        status: 'CANCELLED',
        cancelledById: actor.id,
        cancellationReason: reason,
      },
    );
    await manager.update(
      Publication,
      { id: publication.id },
      { status: 'ACTIVE' },
    );

    return this.findResponseById(manager, request.id);
  }

  private async listResponses(
    applyScope: (
      query: SelectQueryBuilder<RecoveryRequest>,
    ) => SelectQueryBuilder<RecoveryRequest>,
  ): Promise<RecoveryRequestResponse[]> {
    const query = this.baseResponseQuery(this.requests.createQueryBuilder('request'));
    const scoped = applyScope(query);
    const raw = await scoped
      .orderBy('request.createdAt', 'DESC')
      .addOrderBy('request.id', 'DESC')
      .getRawMany<RawRecoveryRequestResponse>();

    return raw.map(toRecoveryRequestResponse);
  }

  private async findResponseById(
    manager: EntityManager,
    id: string,
  ): Promise<RecoveryRequestResponse> {
    const raw = await this.baseResponseQuery(
      manager.createQueryBuilder(RecoveryRequest, 'request'),
    )
      .where('request.id = :id', { id })
      .getRawOne<RawRecoveryRequestResponse>();

    if (!raw) {
      throw this.requestNotFound();
    }

    return toRecoveryRequestResponse(raw);
  }

  private baseResponseQuery(
    query: SelectQueryBuilder<RecoveryRequest>,
  ): SelectQueryBuilder<RecoveryRequest> {
    return query
      .innerJoin(
        Publication,
        'publication',
        'publication.id = request.publicationId',
      )
      .innerJoin(User, 'requester', 'requester.id = request.requesterId')
      .select('request.id', 'request_id')
      .addSelect('request.status', 'request_status')
      .addSelect('request.notes', 'request_notes')
      .addSelect(
        'request.cancellationReason',
        'request_cancellation_reason',
      )
      .addSelect('request.completedAt', 'request_completed_at')
      .addSelect('request.returnNotes', 'request_return_notes')
      .addSelect('request.createdAt', 'request_created_at')
      .addSelect('request.updatedAt', 'request_updated_at')
      .addSelect('publication.id', 'publication_id')
      .addSelect('publication.type', 'publication_type')
      .addSelect('publication.status', 'publication_status')
      .addSelect('publication.title', 'publication_title')
      .addSelect('publication.description', 'publication_description')
      .addSelect('publication.category', 'publication_category')
      .addSelect('publication.location', 'publication_location')
      .addSelect('publication.eventDate', 'publication_event_date')
      .addSelect('publication.createdAt', 'publication_created_at')
      .addSelect('requester.displayName', 'requester_display_name');
  }

  private publicationNotFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: 'PUBLICATION_NOT_FOUND',
      message: 'Publication not found',
    });
  }

  private requestNotFound(): NotFoundException {
    return new NotFoundException({
      statusCode: 404,
      code: 'RECOVERY_REQUEST_NOT_FOUND',
      message: 'Recovery request not found',
    });
  }

  private forbidden(): ForbiddenException {
    return new ForbiddenException({
      statusCode: 403,
      code: 'RECOVERY_REQUEST_FORBIDDEN',
      message: 'The authenticated user cannot perform this action',
    });
  }

  private duplicate(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_DUPLICATE',
      message: 'An active recovery request already exists',
    });
  }

  private notPending(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_NOT_PENDING',
      message: 'The recovery request is not pending',
    });
  }

  private notApproved(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_NOT_APPROVED',
      message: 'The recovery request is not approved',
    });
  }

  private alreadyCompleted(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_ALREADY_COMPLETED',
      message: 'The recovery request is already completed',
    });
  }

  private notCancellable(): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_NOT_CANCELLABLE',
      message: 'The recovery request cannot be cancelled',
    });
  }

  private conflict(message: string): ConflictException {
    return new ConflictException({
      statusCode: 409,
      code: 'RECOVERY_REQUEST_CONFLICT',
      message,
    });
  }
}
