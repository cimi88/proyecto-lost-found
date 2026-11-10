import type { PublicationMatchStatus } from '../domain/publication-match-status';
import type { PublicationSummaryResponse } from '../publication-read-response';
import type { MatchingScoreBreakdown } from './matching-score';

export interface PublicationMatchSuggestionResponse {
  id: string;
  status: PublicationMatchStatus;
  candidate: PublicationSummaryResponse;
  score: number;
  scoreBreakdown: MatchingScoreBreakdown;
  eventDateDifferenceDays: number;
}

export interface PublicationMatchesResponse {
  publicationId: string;
  items: PublicationMatchSuggestionResponse[];
}
