import type { PublicationSummary } from './publication-search.models';

export type PublicationMatchStatus =
  | 'SUGGESTED'
  | 'CONFIRMED'
  | 'DISMISSED';

export interface PublicationMatchSignalScore {
  score: number;
  weight: number;
  contribution: number;
}

export interface PublicationMatchScoreBreakdown {
  text: PublicationMatchSignalScore;
  category: PublicationMatchSignalScore;
  date: PublicationMatchSignalScore;
  location: PublicationMatchSignalScore;
}

export interface PublicationMatchSuggestion {
  id: string;
  status: 'SUGGESTED';
  candidate: PublicationSummary;
  score: number;
  scoreBreakdown: PublicationMatchScoreBreakdown;
  eventDateDifferenceDays: number;
}

export interface PublicationMatchesResponse {
  publicationId: string;
  items: PublicationMatchSuggestion[];
}
