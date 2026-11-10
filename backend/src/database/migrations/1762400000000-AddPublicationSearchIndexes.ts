import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicationSearchIndexes1762400000000
  implements MigrationInterface
{
  name = 'AddPublicationSearchIndexes1762400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE INDEX "publications_title_trgm_idx" ON "publications" USING gin ("title" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX "publications_description_trgm_idx" ON "publications" USING gin ("description" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX "publications_location_trgm_idx" ON "publications" USING gin ("location" gin_trgm_ops)',
    );
    await queryRunner.query(
      'CREATE INDEX "publications_status_created_at_idx" ON "publications" ("status", "created_at" DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS "publications_status_created_at_idx"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "publications_location_trgm_idx"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "publications_description_trgm_idx"',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS "publications_title_trgm_idx"',
    );
  }
}
