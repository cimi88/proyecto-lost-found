export const PUBLICATION_SORTS = [
  'recent',
  'oldest',
  'relevance',
] as const;

export type PublicationSort = (typeof PUBLICATION_SORTS)[number];

export const DEFAULT_PUBLICATION_SORT: PublicationSort = 'recent';

export function isPublicationSort(value: unknown): value is PublicationSort {
  return (
    typeof value === 'string' &&
    (PUBLICATION_SORTS as readonly string[]).includes(value)
  );
}
