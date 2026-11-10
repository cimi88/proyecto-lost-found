import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { Subscription } from 'rxjs';
import { PUBLICATION_CATEGORY_LABELS } from '../domain/publication-category';
import type { OwnPublication } from '../models/publication-management.models';
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
} from '../models/publication-search.models';
import { PublicationManagementService } from '../services/publication-management.service';
import { describeManagementError } from '../utils/publication-management-error';

@Component({
  selector: 'app-my-publication-detail-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './my-publication-detail-page.component.html',
  styleUrl: './publication-detail-page.component.scss',
})
export class MyPublicationDetailPageComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly publicationManagement = inject(
    PublicationManagementService,
  );

  private activeRequest?: Subscription;

  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly publication = signal<OwnPublication | null>(null);
  readonly publicationId = signal('');

  readonly statusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;
  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.publicationId.set(id);
      this.load(id);
    });
  }

  retry(): void {
    this.load(this.publicationId());
  }

  private load(id: string): void {
    this.activeRequest?.unsubscribe();
    this.loading.set(true);
    this.notFound.set(false);
    this.errorMessage.set(null);
    this.publication.set(null);

    if (!id) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.activeRequest = this.publicationManagement
      .getMineById(id)
      .subscribe({
        next: (publication) => {
          this.loading.set(false);
          this.publication.set(publication);
        },
        error: (error: unknown) => {
          this.loading.set(false);

          if (error instanceof HttpErrorResponse && error.status === 404) {
            this.notFound.set(true);
            return;
          }

          this.errorMessage.set(
            describeManagementError(
              error,
              'No se pudo cargar la publicación. Intentá nuevamente.',
            ),
          );
        },
      });
  }
}
