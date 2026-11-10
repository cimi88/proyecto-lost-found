import type { MatchingConfig } from '../../config/env.validation';
import type { Publication } from '../publication.entity';
import type {
  MatchingCandidate,
  MatchingSource,
} from './publication-matching.service';

export interface MatchingSignalScore {
  score: number;
  weight: number;
  contribution: number;
}

export interface MatchingScoreBreakdown {
  text: MatchingSignalScore;
  category: MatchingSignalScore;
  date: MatchingSignalScore;
  location: MatchingSignalScore;
}

export interface ScoredMatchingCandidate {
  candidate: MatchingCandidate;
  score: number;
  unroundedScore: number;
  scoreBreakdown: MatchingScoreBreakdown;
}

function roundScore(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function signal(score: number, weight: number): MatchingSignalScore {
  return {
    score,
    weight,
    contribution: score * weight,
  };
}

export function scoreMatchingCandidate(
  source: MatchingSource,
  candidate: MatchingCandidate,
  config: MatchingConfig,
): ScoredMatchingCandidate {
  const textScore = Math.max(0, Math.min(1, candidate.textScore));
  const locationScore = Math.max(0, Math.min(1, candidate.locationScore));
  const categoryScore =
    source.category === candidate.publication.category ? 1 : 0;
  const dateScore = Math.max(
    0,
    1 - candidate.dateDifferenceDays / config.dateWindowDays,
  );
  const scoreBreakdown: MatchingScoreBreakdown = {
    text: signal(textScore, config.textWeight),
    category: signal(categoryScore, config.categoryWeight),
    date: signal(dateScore, config.dateWeight),
    location: signal(locationScore, config.locationWeight),
  };
  const unroundedScore =
    scoreBreakdown.text.contribution +
    scoreBreakdown.category.contribution +
    scoreBreakdown.date.contribution +
    scoreBreakdown.location.contribution;

  return {
    candidate,
    score: roundScore(unroundedScore),
    unroundedScore,
    scoreBreakdown,
  };
}

export function selectMatchingSuggestions(
  candidates: ScoredMatchingCandidate[],
  config: MatchingConfig,
): ScoredMatchingCandidate[] {
  return candidates
    .filter(({ unroundedScore }) => unroundedScore >= config.suggestionThreshold)
    .sort((left, right) => {
      const scoreDifference = right.unroundedScore - left.unroundedScore;

      if (scoreDifference !== 0) {
        return scoreDifference;
      }

      const dateDifference =
        right.candidate.publication.eventDate.localeCompare(
          left.candidate.publication.eventDate,
        );

      return dateDifference !== 0
        ? dateDifference
        : left.candidate.publication.id.localeCompare(
            right.candidate.publication.id,
          );
    })
    .slice(0, config.maxSuggestions);
}

export type PublicMatchingCandidate = Pick<
  Publication,
  | 'id'
  | 'type'
  | 'status'
  | 'title'
  | 'description'
  | 'category'
  | 'location'
  | 'eventDate'
  | 'createdAt'
>;
