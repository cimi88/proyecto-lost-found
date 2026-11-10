import type { QueryRunner } from 'typeorm';
import { AddRecoveryRequests1794100000000 } from './1794100000000-AddRecoveryRequests';

describe('AddRecoveryRequests1794100000000', () => {
  const migration = new AddRecoveryRequests1794100000000();

  function buildQueryRunner() {
    return {
      query: jest.fn(async () => undefined),
    };
  }

  it('creates the table, checks, foreign keys and uniqueness indexes', async () => {
    const queryRunner = buildQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const statements = queryRunner.query.mock.calls.map(([query]) => query);

    expect(statements).toHaveLength(5);
    expect(statements[0]).toContain('CREATE TABLE "recovery_requests"');
    expect(statements[0]).toContain('recovery_requests_status_check');
    expect(statements[0]).toContain('recovery_requests_cancellation_check');
    expect(statements[0]).toContain('ON DELETE RESTRICT');
    expect(statements[1]).toContain(
      'recovery_requests_active_requester_unique',
    );
    expect(statements[1]).toContain("status\" IN ('PENDING', 'APPROVED')");
    expect(statements[2]).toContain(
      'recovery_requests_single_approved_unique',
    );
    expect(statements[2]).toContain('"publication_id"');
    expect(statements[2]).toContain("status\" = 'APPROVED'");
    expect(statements[3]).toContain('recovery_requests_publication_status_idx');
    expect(statements[4]).toContain('recovery_requests_requester_status_idx');
  });

  it('reverts only the recovery requests table', async () => {
    const queryRunner = buildQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    expect(queryRunner.query).toHaveBeenCalledWith(
      'DROP TABLE IF EXISTS "recovery_requests"',
    );
  });
});
