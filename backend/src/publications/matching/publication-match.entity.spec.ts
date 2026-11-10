import { getMetadataArgsStorage } from 'typeorm';
import { Publication } from '../publication.entity';
import { PublicationMatch } from './publication-match.entity';

describe('publication matching entity metadata', () => {
  it('maps searchText to the stored generated database column', () => {
    const column = getMetadataArgsStorage().columns.find(
      (candidate) =>
        candidate.target === Publication &&
        candidate.propertyName === 'searchText',
    );

    expect(column).toMatchObject({
      options: {
        name: 'search_text',
        type: 'text',
        generatedType: 'STORED',
      },
    });
    expect(column?.options.asExpression).toContain('regexp_replace');
  });

  it('maps the canonical LOST/FOUND pair and persisted score/status columns', () => {
    const columns = getMetadataArgsStorage().columns.filter(
      (candidate) => candidate.target === PublicationMatch,
    );

    expect(columns.map((column) => column.options.name ?? column.propertyName)).toEqual([
      'id',
      'lost_publication_id',
      'found_publication_id',
      'status',
      'score',
      'created_at',
      'updated_at',
    ]);
    expect(columns.find((column) => column.propertyName === 'score')?.options).toMatchObject({
      type: 'numeric',
      precision: 5,
      scale: 4,
    });
  });
});
