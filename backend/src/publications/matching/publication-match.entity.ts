import {
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
  Column,
} from 'typeorm';
import type { PublicationMatchStatus } from '../domain/publication-match-status';

@Entity({ name: 'publication_matches' })
export class PublicationMatch {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ name: 'lost_publication_id', type: 'uuid' })
  lostPublicationId: string;

  @Column({ name: 'found_publication_id', type: 'uuid' })
  foundPublicationId: string;

  @Column({ type: 'varchar', length: 12, default: 'SUGGESTED' })
  status: PublicationMatchStatus;

  @Column({ type: 'numeric', precision: 5, scale: 4 })
  score: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
