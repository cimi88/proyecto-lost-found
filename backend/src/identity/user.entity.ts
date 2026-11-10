import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserRole } from './user-role';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'uuid', default: () => 'gen_random_uuid()' })
  id: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'varchar', length: 16 })
  role: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
