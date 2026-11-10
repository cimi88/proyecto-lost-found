import type { QueryRunner } from 'typeorm';
import { AddRecoveryRequestCompletion1794200000000 } from './1794200000000-AddRecoveryRequestCompletion';

describe('AddRecoveryRequestCompletion1794200000000', () => {
  const migration = new AddRecoveryRequestCompletion1794200000000();

  function buildQueryRunner() {
    return {
      query: jest.fn(async () => undefined),
    };
  }

  it('adds the completion columns, FK and consistency check', async () => {
    const queryRunner = buildQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const statements = queryRunner.query.mock.calls.map(([query]) => query);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('"completed_at"');
    expect(statements[0]).toContain('"completed_by_id"');
    expect(statements[0]).toContain('"return_notes"');
    expect(statements[1]).toContain('recovery_requests_completed_by_fk');
    expect(statements[1]).toContain('ON DELETE RESTRICT');
    expect(statements[2]).toContain('recovery_requests_completion_check');
    expect(statements[2]).toContain('"status" = \'COMPLETED\'');
    expect(statements[2]).toContain('"status" <> \'COMPLETED\'');
  });

  it('reverts only the CU8 completion fields and constraints', async () => {
    const queryRunner = buildQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const statements = queryRunner.query.mock.calls.map(([query]) => query);

    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('recovery_requests_completion_check');
    expect(statements[1]).toContain('recovery_requests_completed_by_fk');
    expect(statements[2]).toContain('DROP COLUMN IF EXISTS "return_notes"');
    expect(statements[2]).toContain('DROP COLUMN IF EXISTS "completed_by_id"');
    expect(statements[2]).toContain('DROP COLUMN IF EXISTS "completed_at"');
  });
});
