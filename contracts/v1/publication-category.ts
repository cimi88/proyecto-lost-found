/**
 * Contrato HTTP v1 — categorías de publicación.
 *
 * Se mantiene sincronizado manualmente con:
 * - backend/src/publications/domain/publication-category.ts
 * - frontend/src/app/publications/domain/publication-category.ts
 *
 * La coherencia se verifica con pruebas; no se genera código automáticamente.
 */
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
