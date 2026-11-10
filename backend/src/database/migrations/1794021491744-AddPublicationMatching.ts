import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicationMatching1794021491744
  implements MigrationInterface
{
  name = 'AddPublicationMatching1794021491744';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "publications"
      ADD COLUMN "search_text" text GENERATED ALWAYS AS (
        lower(
          regexp_replace(
            "title" || ' ' || "description" || ' ' || "location",
            '[[:space:]]+',
            ' ',
            'g'
          )
        )
      ) STORED
    `);

    await queryRunner.query(
      'CREATE INDEX "publications_search_text_trgm_idx" ON "publications" USING gin ("search_text" gin_trgm_ops)',
    );

    await queryRunner.query(`
      CREATE TABLE "publication_matches" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "lost_publication_id" uuid NOT NULL,
        "found_publication_id" uuid NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'SUGGESTED',
        "score" numeric(5,4) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "publication_matches_distinct_publications_check"
          CHECK ("lost_publication_id" <> "found_publication_id"),
        CONSTRAINT "publication_matches_status_check"
          CHECK ("status" IN ('SUGGESTED', 'CONFIRMED', 'DISMISSED')),
        CONSTRAINT "publication_matches_score_check"
          CHECK ("score" >= 0 AND "score" <= 1),
        CONSTRAINT "publication_matches_lost_found_unique"
          UNIQUE ("lost_publication_id", "found_publication_id"),
        CONSTRAINT "publication_matches_lost_publication_fk"
          FOREIGN KEY ("lost_publication_id") REFERENCES "publications" ("id") ON DELETE CASCADE,
        CONSTRAINT "publication_matches_found_publication_fk"
          FOREIGN KEY ("found_publication_id") REFERENCES "publications" ("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(
      'CREATE INDEX "publication_matches_lost_status_score_idx" ON "publication_matches" ("lost_publication_id", "status", "score" DESC)',
    );
    await queryRunner.query(
      'CREATE INDEX "publication_matches_found_status_score_idx" ON "publication_matches" ("found_publication_id", "status", "score" DESC)',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "publication_matches"');
    await queryRunner.query(
      'DROP INDEX IF EXISTS "publications_search_text_trgm_idx"',
    );
    await queryRunner.query(
      'ALTER TABLE "publications" DROP COLUMN IF EXISTS "search_text"',
    );
  }
}
