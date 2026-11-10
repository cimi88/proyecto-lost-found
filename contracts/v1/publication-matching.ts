import type { PublicationSummary } from './publication-search';

/**
 * Contrato HTTP v1 — sugerencias públicas de coincidencias.
 *
 * Endpoint: GET /api/v1/publications/:id/matches
 * No requiere identidad. Solo devuelve pares SUGGESTED cuyos dos lados siguen
 * ACTIVE. No expone ownerId ni información privada.
 */
export type PublicationMatchStatus =
  | 'SUGGESTED'
  | 'CONFIRMED'
  | 'DISMISSED';

export interface PublicationMatchSignalScore {
  /** Valor normalizado de la señal entre 0 y 1. */
  score: number;
  /** Peso configurado de la señal. */
  weight: number;
  /** score multiplicado por weight. */
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
  /** Score total normalizado entre 0 y 1. */
  score: number;
  scoreBreakdown: PublicationMatchScoreBreakdown;
  eventDateDifferenceDays: number;
}

export interface PublicationMatchesResponse {
  publicationId: string;
  items: PublicationMatchSuggestion[];
}

export const PUBLICATION_MATCHING_ENDPOINT =
  '/api/v1/publications/:id/matches';
export const PUBLICATION_MATCH_TRIGRAM_THRESHOLD = 0.15;
export const PUBLICATION_MATCH_SUGGESTION_THRESHOLD = 0.55;
export const PUBLICATION_MATCH_CANDIDATE_LIMIT = 500;
export const PUBLICATION_MATCH_MAX_SUGGESTIONS = 10;
