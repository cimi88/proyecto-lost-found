export const PUBLICATION_CATEGORIES = [
  'ELECTRONICS',
  'DOCUMENTS',
  'KEYS',
  'BAGS',
  'CLOTHING',
  'ACCESSORIES',
  'BOOKS',
  'SPORTS',
  'OTHER',
] as const;

export type PublicationCategory = (typeof PUBLICATION_CATEGORIES)[number];

export function isPublicationCategory(
  value: unknown,
): value is PublicationCategory {
  return (
    typeof value === 'string' &&
    (PUBLICATION_CATEGORIES as readonly string[]).includes(value)
  );
}
