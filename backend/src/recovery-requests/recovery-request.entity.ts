import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { RecoveryRequestStatus } from './domain/recovery-request-status';

@Entity({ name: 'recovery_requests' })
export class RecoveryRequest {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'publication_id', type: 'uuid' })
  publicationId: string;

  @Column({ name: 'requester_id', type: 'uuid' })
  requesterId: string;

  @Column({ type: 'varchar', length: 12, default: 'PENDING' })
  status: RecoveryRequestStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes: string | null;

  @Column({ name: 'cancelled_by_id', type: 'uuid', nullable: true })
  cancelledById: string | null;

  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancellationReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;

  @Column({ name: 'completed_by_id', type: 'uuid', nullable: true })
  completedById: string | null;

  @Column({
    name: 'return_notes',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  returnNotes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
