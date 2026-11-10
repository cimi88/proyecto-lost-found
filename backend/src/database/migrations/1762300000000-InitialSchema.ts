import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1762300000000 implements MigrationInterface {
  name = 'InitialSchema1762300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS pg_trgm');

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(255) NOT NULL UNIQUE,
        "display_name" varchar(120) NOT NULL,
        "role" varchar(16) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "users_role_check" CHECK ("role" IN ('USER', 'ADMIN'))
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "publications" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "type" varchar(8) NOT NULL,
        "status" varchar(12) NOT NULL,
        "owner_id" uuid NOT NULL,
        "title" varchar(120) NOT NULL,
        "description" varchar(1000) NOT NULL,
        "category" varchar(32) NOT NULL,
        "location" varchar(120) NOT NULL,
        "event_date" date NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "publications_type_check" CHECK ("type" IN ('LOST', 'FOUND')),
        CONSTRAINT "publications_status_check" CHECK ("status" IN ('ACTIVE', 'RESERVED', 'RETURNED', 'CLOSED')),
        CONSTRAINT "publications_category_check" CHECK ("category" IN (
          'ELECTRONICS', 'DOCUMENTS', 'KEYS', 'BAGS', 'CLOTHING',
          'ACCESSORIES', 'BOOKS', 'SPORTS', 'OTHER'
        )),
        CONSTRAINT "publications_owner_fk" FOREIGN KEY ("owner_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "publications_owner_id_idx" ON "publications" ("owner_id")',
    );

    await queryRunner.query(`
      INSERT INTO "users" ("id", "email", "display_name", "role")
      VALUES (
        '00000000-0000-4000-8000-000000000001',
        'demo@lostfound.local',
        'Usuario Demo',
        'USER'
      )
      ON CONFLICT ("id") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "publications"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
