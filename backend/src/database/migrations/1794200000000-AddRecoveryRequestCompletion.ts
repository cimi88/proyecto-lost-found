import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecoveryRequestCompletion1794200000000
  implements MigrationInterface
{
  name = 'AddRecoveryRequestCompletion1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recovery_requests"
      ADD COLUMN "completed_at" timestamptz,
      ADD COLUMN "completed_by_id" uuid,
      ADD COLUMN "return_notes" varchar(500)
    `);

    await queryRunner.query(`
      ALTER TABLE "recovery_requests"
      ADD CONSTRAINT "recovery_requests_completed_by_fk"
      FOREIGN KEY ("completed_by_id") REFERENCES "users" ("id")
      ON DELETE RESTRICT
    `);

    await queryRunner.query(`
      ALTER TABLE "recovery_requests"
      ADD CONSTRAINT "recovery_requests_completion_check"
      CHECK (
        (
          "status" = 'COMPLETED'
          AND "completed_at" IS NOT NULL
          AND "completed_by_id" IS NOT NULL
        )
        OR (
          "status" <> 'COMPLETED'
          AND "completed_at" IS NULL
          AND "completed_by_id" IS NULL
          AND "return_notes" IS NULL
        )
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "recovery_requests" DROP CONSTRAINT IF EXISTS "recovery_requests_completion_check"',
    );
    await queryRunner.query(
      'ALTER TABLE "recovery_requests" DROP CONSTRAINT IF EXISTS "recovery_requests_completed_by_fk"',
    );
    await queryRunner.query(`
      ALTER TABLE "recovery_requests"
      DROP COLUMN IF EXISTS "return_notes",
      DROP COLUMN IF EXISTS "completed_by_id",
      DROP COLUMN IF EXISTS "completed_at"
    `);
  }
}
