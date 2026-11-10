import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import {
  PUBLICATION_CATEGORIES,
  PUBLICATION_CATEGORY_LABELS,
  type PublicationCategory,
} from '../domain/publication-category';
import {
  DEFAULT_PUBLICATION_SORT,
  PUBLICATION_SORT_LABELS,
  PUBLICATION_TYPE_LABELS,
  type PublicationSearchResponse,
  type PublicationSort,
  type PublicationType,
} from '../models/publication-search.models';
import { PublicationSearchService } from '../services/publication-search.service';

const PAGE_SIZE = 12;

interface SearchCriteria {
  q: string;
  type?: PublicationType;
  category?: PublicationCategory;
  eventDateFrom?: string;
  eventDateTo?: string;
  sort: PublicationSort;
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

@Component({
  selector: 'app-publication-list-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './publication-list-page.component.html',
  styleUrl: './publication-list-page.component.scss',
})
export class PublicationListPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publicationSearch = inject(PublicationSearchService);

  private activeRequest?: Subscription;

  readonly pageSize = PAGE_SIZE;
  readonly searchControl = new FormControl('', { nonNullable: true });
  readonly typeControl = new FormControl<PublicationType | ''>('', {
    nonNullable: true,
  });
  readonly categoryControl = new FormControl<PublicationCategory | ''>('', {
    nonNullable: true,
  });
  readonly eventDateFromControl = new FormControl('', { nonNullable: true });
  readonly eventDateToControl = new FormControl('', { nonNullable: true });
  readonly sortControl = new FormControl<PublicationSort>(
    DEFAULT_PUBLICATION_SORT,
    { nonNullable: true },
  );

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly formError = signal<string | null>(null);
  readonly response = signal<PublicationSearchResponse | null>(null);
  readonly query = signal('');
  readonly page = signal(1);
  readonly criteria = signal<SearchCriteria>({
    q: '',
    sort: DEFAULT_PUBLICATION_SORT,
  });
  readonly hasFilters = signal(false);
  readonly hasSearchTerm = signal(false);

  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;

  readonly typeOptions: ReadonlyArray<SelectOption<PublicationType>> = (
    Object.keys(PUBLICATION_TYPE_LABELS) as PublicationType[]
  ).map((value) => ({ value, label: PUBLICATION_TYPE_LABELS[value] }));

  readonly categoryOptions: ReadonlyArray<SelectOption<PublicationCategory>> =
    PUBLICATION_CATEGORIES.map((value) => ({
      value,
      label: PUBLICATION_CATEGORY_LABELS[value],
    }));

  readonly sortOptions: ReadonlyArray<SelectOption<PublicationSort>> = (
    Object.keys(PUBLICATION_SORT_LABELS) as PublicationSort[]
  ).map((value) => ({ value, label: PUBLICATION_SORT_LABELS[value] }));

  constructor() {
    this.searchControl.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((value) => {
        const hasTerm = Boolean(value.trim());

        this.hasSearchTerm.set(hasTerm);

        if (!hasTerm && this.sortControl.value === 'relevance') {
          this.sortControl.setValue(DEFAULT_PUBLICATION_SORT, {
            emitEvent: false,
          });
        }
      });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const criteria = this.parseCriteria(params);
        const page = this.parsePage(params.get('page'));

        this.applyCriteriaToControls(criteria);
        this.criteria.set(criteria);
        this.query.set(criteria.q);
        this.page.set(page);
        this.hasFilters.set(this.filtersArePresent(criteria));
        this.formError.set(null);
        this.load(criteria, page);
      });
  }

  submit(event?: Event): Promise<void> {
    event?.preventDefault();
    this.formError.set(null);

    const q = this.searchControl.value.trim();
    let sort = this.sortControl.value;

    if (sort === 'relevance' && !q) {
      sort = DEFAULT_PUBLICATION_SORT;
      this.sortControl.setValue(sort, { emitEvent: false });
    }

    const eventDateFrom =
      this.eventDateFromControl.value.trim() || undefined;
    const eventDateTo = this.eventDateToControl.value.trim() || undefined;

    if (eventDateFrom && eventDateTo && eventDateFrom > eventDateTo) {
      this.formError.set(
        'La fecha "Desde" no puede ser posterior a la fecha "Hasta".',
      );
      return Promise.resolve();
    }

    return this.navigate(
      {
        q,
        type: this.typeControl.value || undefined,
        category: this.categoryControl.value || undefined,
        eventDateFrom,
        eventDateTo,
        sort,
      },
      1,
    );
  }

  clear(): Promise<void> {
    this.searchControl.setValue('', { emitEvent: false });
    this.hasSearchTerm.set(false);
    this.typeControl.setValue('', { emitEvent: false });
    this.categoryControl.setValue('', { emitEvent: false });
    this.eventDateFromControl.setValue('', { emitEvent: false });
    this.eventDateToControl.setValue('', { emitEvent: false });
    this.sortControl.setValue(DEFAULT_PUBLICATION_SORT, { emitEvent: false });
    this.formError.set(null);

    return this.navigate({ q: '', sort: DEFAULT_PUBLICATION_SORT }, 1);
  }

  previousPage(): Promise<void> {
    if (this.page() <= 1) {
      return Promise.resolve();
    }

    return this.navigate(this.criteria(), this.page() - 1);
  }

  nextPage(): Promise<void> {
    const totalPages = this.response()?.totalPages ?? 0;

    if (this.page() >= totalPages) {
      return Promise.resolve();
    }

    return this.navigate(this.criteria(), this.page() + 1);
  }

  retry(): void {
    this.load(this.criteria(), this.page());
  }

  private navigate(criteria: SearchCriteria, page: number): Promise<void> {
    const queryParams: Record<string, string | number> = { page };

    if (criteria.q) {
      queryParams['q'] = criteria.q;
    }

    if (criteria.type) {
      queryParams['type'] = criteria.type;
    }

    if (criteria.category) {
      queryParams['category'] = criteria.category;
    }

    if (criteria.eventDateFrom) {
      queryParams['eventDateFrom'] = criteria.eventDateFrom;
    }

    if (criteria.eventDateTo) {
      queryParams['eventDateTo'] = criteria.eventDateTo;
    }

    if (criteria.sort !== DEFAULT_PUBLICATION_SORT) {
      queryParams['sort'] = criteria.sort;
    }

    const urlTree = this.router.createUrlTree(['/publications'], {
      queryParams,
    });

    if (this.router.serializeUrl(urlTree) === this.router.url) {
      this.load(criteria, page);
      return Promise.resolve();
    }

    return this.router.navigateByUrl(urlTree).then(() => undefined);
  }

  private load(criteria: SearchCriteria, page: number): void {
    this.activeRequest?.unsubscribe();
    this.loading.set(true);
    this.errorMessage.set(null);
    this.response.set(null);
    this.criteria.set(criteria);
    this.query.set(criteria.q);
    this.hasFilters.set(this.filtersArePresent(criteria));

    this.activeRequest = this.publicationSearch
      .search({ ...criteria, page, pageSize: PAGE_SIZE })
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          this.response.set(response);
        },
        error: (error: unknown) => {
          this.loading.set(false);
          this.response.set(null);
          this.errorMessage.set(this.describeError(error));
        },
      });
  }

  private parseCriteria(params: {
    get(name: string): string | null;
  }): SearchCriteria {
    const q = (params.get('q') ?? '').trim();
    const sort = this.parseSort(params.get('sort'), q);

    return {
      q,
      type: this.parseType(params.get('type')),
      category: this.parseCategory(params.get('category')),
      eventDateFrom: this.parseDate(params.get('eventDateFrom')),
      eventDateTo: this.parseDate(params.get('eventDateTo')),
      sort,
    };
  }

  private applyCriteriaToControls(criteria: SearchCriteria): void {
    this.searchControl.setValue(criteria.q, { emitEvent: false });
    this.hasSearchTerm.set(Boolean(criteria.q));
    this.typeControl.setValue(criteria.type ?? '', { emitEvent: false });
    this.categoryControl.setValue(criteria.category ?? '', {
      emitEvent: false,
    });
    this.eventDateFromControl.setValue(criteria.eventDateFrom ?? '', {
      emitEvent: false,
    });
    this.eventDateToControl.setValue(criteria.eventDateTo ?? '', {
      emitEvent: false,
    });
    this.sortControl.setValue(criteria.sort, { emitEvent: false });
  }

  private filtersArePresent(criteria: SearchCriteria): boolean {
    return Boolean(
      criteria.type ||
        criteria.category ||
        criteria.eventDateFrom ||
        criteria.eventDateTo,
    );
  }

  private parseType(value: string | null): PublicationType | undefined {
    return value === 'LOST' || value === 'FOUND' ? value : undefined;
  }

  private parseCategory(
    value: string | null,
  ): PublicationCategory | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();

    return (PUBLICATION_CATEGORIES as readonly string[]).includes(trimmed)
      ? (trimmed as PublicationCategory)
      : undefined;
  }

  private parseSort(value: string | null, q: string): PublicationSort {
    const candidate =
      value === 'recent' || value === 'oldest' || value === 'relevance'
        ? value
        : DEFAULT_PUBLICATION_SORT;

    return candidate === 'relevance' && !q
      ? DEFAULT_PUBLICATION_SORT
      : candidate;
  }

  private parseDate(value: string | null): string | undefined {
    if (!value) {
      return undefined;
    }

    const trimmed = value.trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return undefined;
    }

    const [year, month, day] = trimmed.split('-').map(Number);
    const date = new Date(0);
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCFullYear(year, month - 1, day);

    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? trimmed
      : undefined;
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudo conectar con el servidor. Verificá que la API esté en ejecución.';
    }

    if (error instanceof HttpErrorResponse && error.status === 400) {
      return 'La búsqueda o los filtros no son válidos. Revisalos e intentá nuevamente.';
    }

    return 'No se pudieron cargar las publicaciones. Intentá nuevamente.';
  }

  private parsePage(value: string | null): number {
    const page = Number(value);

    if (!Number.isInteger(page) || page < 1) {
      return 1;
    }

    return page;
  }
}
