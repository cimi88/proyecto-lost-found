import { DEFAULT_MATCHING_CONFIG } from '../../config/env.validation';
import type { Publication } from '../publication.entity';
import type {
  MatchingCandidate,
  MatchingSource,
} from './publication-matching.service';
import {
  scoreMatchingCandidate,
  selectMatchingSuggestions,
} from './matching-score';

const SOURCE: MatchingSource = {
  id: '11111111-1111-4111-8111-111111111111',
  type: 'LOST',
  status: 'ACTIVE',
  title: 'Billetera negra',
  description: 'Billetera de cuero con tarjetas.',
  category: 'BAGS',
  location: 'Plaza Central',
  eventDate: '2026-11-01',
  searchText: 'billetera negra billetera de cuero con tarjetas plaza central',
};

function candidate(overrides: Partial<Publication> & {
  textScore?: number;
  locationScore?: number;
  dateDifferenceDays?: number;
} = {}): MatchingCandidate {
  const {
    textScore = 0.8,
    locationScore = 0.6,
    dateDifferenceDays = 0,
    ...publicationOverrides
  } = overrides;

  return {
    publication: {
      id: '22222222-2222-4222-8222-222222222222',
      type: 'FOUND',
      status: 'ACTIVE',
      ownerId: '00000000-0000-4000-8000-000000000001',
      title: 'Billetera negra encontrada',
      description: 'Billetera de cuero con tarjetas encontradas.',
      category: 'BAGS',
      location: 'Plaza Central',
      eventDate: '2026-11-01',
      createdAt: new Date('2026-11-06T10:00:00.000Z'),
      updatedAt: new Date('2026-11-06T10:00:00.000Z'),
      searchText: 'billetera negra encontrada',
      ...publicationOverrides,
    } as Publication,
    textScore,
    locationScore,
    dateDifferenceDays,
  };
}

describe('matching score', () => {
  it('calculates the approved weighted score and breakdown', () => {
    const result = scoreMatchingCandidate(
      SOURCE,
      candidate({ textScore: 0.8, locationScore: 0.6 }),
      DEFAULT_MATCHING_CONFIG,
    );

    expect(result.score).toBe(0.84);
    expect(result.scoreBreakdown).toEqual({
      text: { score: 0.8, weight: 0.5, contribution: 0.4 },
      category: { score: 1, weight: 0.2, contribution: 0.2 },
      date: { score: 1, weight: 0.15, contribution: 0.15 },
      location: { score: 0.6, weight: 0.15, contribution: 0.09 },
    });
  });

  it('keeps category soft and gives exact category match only its weighted signal', () => {
    const result = scoreMatchingCandidate(
      SOURCE,
      candidate({ category: 'KEYS', textScore: 1, locationScore: 1 }),
      DEFAULT_MATCHING_CONFIG,
    );

    expect(result.scoreBreakdown.category).toEqual({
      score: 0,
      weight: 0.2,
      contribution: 0,
    });
    expect(result.unroundedScore).toBe(0.8);
  });

  it.each([
    { days: 0, expected: 1 },
    { days: 30, expected: 0 },
    { days: 31, expected: 0 },
  ])('uses the date decay at $days days', ({ days, expected }) => {
    const result = scoreMatchingCandidate(
      SOURCE,
      candidate({ dateDifferenceDays: days }),
      DEFAULT_MATCHING_CONFIG,
    );

    expect(result.scoreBreakdown.date.score).toBe(expected);
  });

  it('applies the 0.55 threshold before persistence rounding', () => {
    const atThreshold = scoreMatchingCandidate(
      SOURCE,
      candidate({ textScore: 0.8, category: 'KEYS', locationScore: 0 }),
      DEFAULT_MATCHING_CONFIG,
    );
    const belowThreshold = scoreMatchingCandidate(
      SOURCE,
      candidate({ textScore: 0.799, category: 'KEYS', locationScore: 0 }),
      DEFAULT_MATCHING_CONFIG,
    );

    expect(atThreshold.unroundedScore).toBe(0.55);
    expect(
      selectMatchingSuggestions([atThreshold, belowThreshold], DEFAULT_MATCHING_CONFIG),
    ).toEqual([atThreshold]);
  });

  it('orders by score, event date, then ID and respects the configured maximum', () => {
    const first = scoreMatchingCandidate(
      SOURCE,
      candidate({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', eventDate: '2026-11-03' }),
      DEFAULT_MATCHING_CONFIG,
    );
    const second = scoreMatchingCandidate(
      SOURCE,
      candidate({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', eventDate: '2026-11-02' }),
      DEFAULT_MATCHING_CONFIG,
    );
    const sameDateLowerId = scoreMatchingCandidate(
      SOURCE,
      candidate({ id: '00000000-0000-4000-8000-000000000001', eventDate: '2026-11-03' }),
      DEFAULT_MATCHING_CONFIG,
    );

    expect(
      selectMatchingSuggestions([second, first, sameDateLowerId], {
        ...DEFAULT_MATCHING_CONFIG,
        maxSuggestions: 2,
      }).map((match) => match.candidate.publication.id),
    ).toEqual([
      '00000000-0000-4000-8000-000000000001',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    ]);
  });
});
