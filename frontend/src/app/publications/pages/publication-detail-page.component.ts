import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink, type ParamMap } from '@angular/router';
import type { Subscription } from 'rxjs';
import { PUBLICATION_CATEGORY_LABELS } from '../domain/publication-category';
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
  type PublicationDetail,
} from '../models/publication-search.models';
import type { PublicationMatchSuggestion } from '../models/publication-matching.models';
import { RecoveryRequestPanelComponent } from '../../recovery-requests/components/recovery-request-panel.component';
import { PublicationMatchingService } from '../services/publication-matching.service';
import { PublicationSearchService } from '../services/publication-search.service';

const RETURN_QUERY_PARAM_KEYS = [
  'q',
  'type',
  'category',
  'eventDateFrom',
  'eventDateTo',
  'sort',
  'page',
] as const;

@Component({
  selector: 'app-publication-detail-page',
  imports: [DatePipe, DecimalPipe, RouterLink, RecoveryRequestPanelComponent],
  templateUrl: './publication-detail-page.component.html',
  styleUrl: './publication-detail-page.component.scss',
})
export class PublicationDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly publicationSearch = inject(PublicationSearchService);
  private readonly publicationMatching = inject(PublicationMatchingService);

  private activeRequest?: Subscription;
  private activeMatchingRequest?: Subscription;

  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly publication = signal<PublicationDetail | null>(null);
  readonly publicationId = signal('');
  readonly returnQueryParams = signal<Record<string, string>>({});
  readonly matches = signal<PublicationMatchSuggestion[]>([]);
  readonly matchesLoading = signal(false);
  readonly matchesErrorMessage = signal<string | null>(null);

  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;
  readonly statusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        this.returnQueryParams.set(this.getReturnQueryParams(params));
      });

    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.publicationId.set(id);
      this.load(id);
    });
  }

  retry(): void {
    this.load(this.publicationId());
  }

  retryMatches(): void {
    this.loadMatches(this.publicationId());
  }

  private load(id: string): void {
    this.activeRequest?.unsubscribe();
    this.loading.set(true);
    this.notFound.set(false);
    this.errorMessage.set(null);
    this.publication.set(null);
    this.activeMatchingRequest?.unsubscribe();
    this.matches.set([]);
    this.matchesLoading.set(false);
    this.matchesErrorMessage.set(null);

    if (!id) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.activeRequest = this.publicationSearch.getById(id).subscribe({
      next: (publication) => {
        this.loading.set(false);
        this.publication.set(publication);
        this.loadMatches(id);
      },
      error: (error: unknown) => {
        this.loading.set(false);

        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notFound.set(true);
          return;
        }

        this.errorMessage.set(this.describeError(error));
      },
    });
  }

  private describeError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudo conectar con el servidor. Verificá que la API esté en ejecución.';
    }

    return 'No se pudo cargar la publicación. Intentá nuevamente.';
  }

  private loadMatches(id: string): void {
    this.activeMatchingRequest?.unsubscribe();
    this.matches.set([]);
    this.matchesLoading.set(true);
    this.matchesErrorMessage.set(null);

    this.activeMatchingRequest = this.publicationMatching
      .getSuggestions(id)
      .subscribe({
        next: (response) => {
          this.matchesLoading.set(false);
          this.matches.set(response.items);
        },
        error: (error: unknown) => {
          this.matchesLoading.set(false);
          this.matchesErrorMessage.set(this.describeMatchingError(error));
        },
      });
  }

  private describeMatchingError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudieron cargar las coincidencias. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudieron cargar las coincidencias. Intentá nuevamente.';
  }

  private getReturnQueryParams(params: ParamMap): Record<string, string> {
    const queryParams: Record<string, string> = {};

    for (const key of RETURN_QUERY_PARAM_KEYS) {
      const value = params.get(key);

      if (value !== null) {
        queryParams[key] = value;
      }
    }

    return queryParams;
  }
}
