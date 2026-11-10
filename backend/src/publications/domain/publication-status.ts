export const PUBLICATION_TYPES = ['LOST', 'FOUND'] as const;

export type PublicationType = (typeof PUBLICATION_TYPES)[number];

export const PUBLICATION_STATUSES = [
  'ACTIVE',
  'RESERVED',
  'RETURNED',
  'CLOSED',
] as const;

export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
