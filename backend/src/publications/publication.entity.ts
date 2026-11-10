import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { PublicationCategory } from './domain/publication-category';
import type {
  PublicationStatus,
  PublicationType,
} from './domain/publication-status';

@Entity({ name: 'publications' })
export class Publication {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 8 })
  type: PublicationType;

  @Column({ type: 'varchar', length: 12 })
  status: PublicationStatus;

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'varchar', length: 1000 })
  description: string;

  @Column({ type: 'varchar', length: 32 })
  category: PublicationCategory;

  @Column({ type: 'varchar', length: 120 })
  location: string;

  @Column({ name: 'event_date', type: 'date' })
  eventDate: string;

  @Column({
    name: 'search_text',
    type: 'text',
    asExpression:
      `lower(regexp_replace("title" || ' ' || "description" || ' ' || "location", '[[:space:]]+', ' ', 'g'))`,
    generatedType: 'STORED',
  })
  searchText: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
