export const PUBLICATION_MATCH_STATUSES = [
  'SUGGESTED',
  'CONFIRMED',
  'DISMISSED',
] as const;

export type PublicationMatchStatus =
  (typeof PUBLICATION_MATCH_STATUSES)[number];
