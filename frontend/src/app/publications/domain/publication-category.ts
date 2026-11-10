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

export const PUBLICATION_CATEGORY_LABELS: Record<
  PublicationCategory,
  string
> = {
  ELECTRONICS: 'Electrónica',
  DOCUMENTS: 'Documentos',
  KEYS: 'Llaves',
  BAGS: 'Bolsos y mochilas',
  CLOTHING: 'Ropa',
  ACCESSORIES: 'Accesorios',
  BOOKS: 'Libros',
  SPORTS: 'Deportes',
  OTHER: 'Otros',
};
