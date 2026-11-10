import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  PUBLICATION_CATEGORY_LABELS,
} from '../domain/publication-category';
import type { OwnPublication } from '../models/publication-management.models';
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
} from '../models/publication-search.models';
import { PublicationManagementService } from '../services/publication-management.service';
import {
  describeManagementError,
  isActiveRequestsError,
} from '../utils/publication-management-error';

@Component({
  selector: 'app-my-publications-page',
  imports: [DatePipe, RouterLink],
  templateUrl: './my-publications-page.component.html',
  styleUrl: './my-publications-page.component.scss',
})
export class MyPublicationsPageComponent {
  private readonly publicationManagement = inject(
    PublicationManagementService,
  );
  private readonly route = inject(ActivatedRoute);

  readonly publications = signal<OwnPublication[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly closingId = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);
  readonly showReceivedLink = signal(false);

  readonly statusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;
  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      if (params.get('updated')) {
        this.successMessage.set('Publicación actualizada correctamente.');
      }
    });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.publicationManagement.getMine().subscribe({
      next: (publications) => {
        this.loading.set(false);
        this.publications.set(publications);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          describeManagementError(
            error,
            'No se pudieron cargar tus publicaciones. Intentá nuevamente.',
          ),
        );
      },
    });
  }

  startClose(id: string): void {
    this.closingId.set(id);
    this.actionError.set(null);
    this.successMessage.set(null);
    this.showReceivedLink.set(false);
  }

  cancelClose(): void {
    this.closingId.set(null);
    this.actionError.set(null);
    this.showReceivedLink.set(false);
  }

  confirmClose(): void {
    const id = this.closingId();

    if (!id || this.actionInProgress()) {
      return;
    }

    this.actionInProgress.set(id);
    this.actionError.set(null);

    this.publicationManagement.close(id).subscribe({
      next: (updated) => {
        this.actionInProgress.set(null);
        this.closingId.set(null);
        this.replacePublication(updated);
        this.successMessage.set('Publicación cerrada correctamente.');
      },
      error: (error: unknown) => {
        this.actionInProgress.set(null);
        this.showReceivedLink.set(isActiveRequestsError(error));
        this.actionError.set(
          describeManagementError(
            error,
            'No se pudo cerrar la publicación. Intentá nuevamente.',
          ),
        );
      },
    });
  }

  private replacePublication(updated: OwnPublication): void {
    this.publications.update((publications) =>
      publications.map((publication) =>
        publication.id === updated.id ? updated : publication,
      ),
    );
  }
}
