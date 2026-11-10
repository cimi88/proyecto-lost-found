import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecoveryRequests1794100000000 implements MigrationInterface {
  name = 'AddRecoveryRequests1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "recovery_requests" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "publication_id" uuid NOT NULL,
        "requester_id" uuid NOT NULL,
        "status" varchar(12) NOT NULL DEFAULT 'PENDING',
        "notes" varchar(500),
        "cancelled_by_id" uuid,
        "cancellation_reason" varchar(500),
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "recovery_requests_status_check"
          CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
        CONSTRAINT "recovery_requests_cancellation_check"
          CHECK (
            (
              "status" = 'CANCELLED'
              AND "cancelled_by_id" IS NOT NULL
              AND "cancellation_reason" IS NOT NULL
              AND char_length(btrim("cancellation_reason")) BETWEEN 3 AND 500
            )
            OR (
              "status" <> 'CANCELLED'
              AND "cancelled_by_id" IS NULL
              AND "cancellation_reason" IS NULL
            )
          ),
        CONSTRAINT "recovery_requests_publication_fk"
          FOREIGN KEY ("publication_id") REFERENCES "publications" ("id") ON DELETE RESTRICT,
        CONSTRAINT "recovery_requests_requester_fk"
          FOREIGN KEY ("requester_id") REFERENCES "users" ("id") ON DELETE RESTRICT,
        CONSTRAINT "recovery_requests_cancelled_by_fk"
          FOREIGN KEY ("cancelled_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT
      )
    `);

    await queryRunner.query(
      'CREATE UNIQUE INDEX "recovery_requests_active_requester_unique" ON "recovery_requests" ("publication_id", "requester_id") WHERE "status" IN (\'PENDING\', \'APPROVED\')',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX "recovery_requests_single_approved_unique" ON "recovery_requests" ("publication_id") WHERE "status" = \'APPROVED\'',
    );
    await queryRunner.query(
      'CREATE INDEX "recovery_requests_publication_status_idx" ON "recovery_requests" ("publication_id", "status")',
    );
    await queryRunner.query(
      'CREATE INDEX "recovery_requests_requester_status_idx" ON "recovery_requests" ("requester_id", "status")',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "recovery_requests"');
  }
}
