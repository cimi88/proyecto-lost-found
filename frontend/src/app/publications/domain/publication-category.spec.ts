import {
  PUBLICATION_CATEGORIES,
  PUBLICATION_CATEGORY_LABELS,
} from './publication-category';

describe('publication categories', () => {
  it('keeps exactly the nine agreed categories', () => {
    expect(PUBLICATION_CATEGORIES).toEqual([
      'ELECTRONICS',
      'DOCUMENTS',
      'KEYS',
      'BAGS',
      'CLOTHING',
      'ACCESSORIES',
      'BOOKS',
      'SPORTS',
      'OTHER',
    ]);
  });

  it('has a Spanish label for every category', () => {
    for (const category of PUBLICATION_CATEGORIES) {
      expect(PUBLICATION_CATEGORY_LABELS[category]).toBeTruthy();
    }
  });
});
