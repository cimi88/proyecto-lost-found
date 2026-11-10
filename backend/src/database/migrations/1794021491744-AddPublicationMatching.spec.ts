import type { QueryRunner } from 'typeorm';
import { AddPublicationMatching1794021491744 } from './1794021491744-AddPublicationMatching';

describe('AddPublicationMatching1794021491744', () => {
  const migration = new AddPublicationMatching1794021491744();

  function buildQueryRunner() {
    return {
      query: jest.fn(async () => undefined),
    };
  }

  it('adds generated search text, the GIN index, and a constrained unique match pair', async () => {
    const queryRunner = buildQueryRunner();

    await migration.up(queryRunner as unknown as QueryRunner);

    const statements = queryRunner.query.mock.calls.map(([query]) => query);

    expect(statements).toHaveLength(5);
    expect(statements[0]).toContain('GENERATED ALWAYS AS');
    expect(statements[0]).toContain('regexp_replace');
    expect(statements[1]).toContain('publications_search_text_trgm_idx');
    expect(statements[1]).toContain('gin_trgm_ops');
    expect(statements[2]).toContain('publication_matches_lost_found_unique');
    expect(statements[2]).toContain('publication_matches_status_check');
    expect(statements[2]).toContain('publication_matches_score_check');
    expect(statements[3]).toContain('publication_matches_lost_status_score_idx');
    expect(statements[4]).toContain('publication_matches_found_status_score_idx');
  });

  it('reverts only the CU6 match table and generated search column/index', async () => {
    const queryRunner = buildQueryRunner();

    await migration.down(queryRunner as unknown as QueryRunner);

    const statements = queryRunner.query.mock.calls.map(([query]) => query);

    expect(statements).toEqual([
      'DROP TABLE IF EXISTS "publication_matches"',
      'DROP INDEX IF EXISTS "publications_search_text_trgm_idx"',
      'ALTER TABLE "publications" DROP COLUMN IF EXISTS "search_text"',
    ]);
  });
});
