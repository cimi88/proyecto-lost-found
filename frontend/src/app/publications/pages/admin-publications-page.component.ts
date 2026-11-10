import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { PUBLICATION_CATEGORY_LABELS } from '../domain/publication-category';
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
  selector: 'app-admin-publications-page',
  imports: [DatePipe],
  templateUrl: './admin-publications-page.component.html',
  styleUrl: './my-publications-page.component.scss',
})
export class AdminPublicationsPageComponent {
  private readonly publicationManagement = inject(
    PublicationManagementService,
  );

  readonly publications = signal<OwnPublication[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly closingId = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);

  readonly statusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;
  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.publicationManagement.getForModeration().subscribe({
      next: (publications) => {
        this.loading.set(false);
        this.publications.set(publications);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(
          describeManagementError(
            error,
            'No se pudieron cargar las publicaciones para moderar. Intentá nuevamente.',
          ),
        );
      },
    });
  }

  startClose(id: string): void {
    this.closingId.set(id);
    this.actionError.set(null);
    this.successMessage.set(null);
  }

  cancelClose(): void {
    this.closingId.set(null);
    this.actionError.set(null);
  }

  confirmClose(): void {
    const id = this.closingId();

    if (!id || this.actionInProgress()) {
      return;
    }

    this.actionInProgress.set(id);
    this.actionError.set(null);

    this.publicationManagement.close(id).subscribe({
      next: (closed) => {
        this.actionInProgress.set(null);
        this.closingId.set(null);
        this.publications.update((publications) =>
          publications.filter((publication) => publication.id !== closed.id),
        );
        this.successMessage.set('Publicación cerrada correctamente.');
      },
      error: (error: unknown) => {
        this.actionInProgress.set(null);
        this.actionError.set(
          isActiveRequestsError(error)
            ? 'No se puede cerrar: tiene solicitudes pendientes o aprobadas. Deben resolverlas los usuarios involucrados.'
            : describeManagementError(
                error,
                'No se pudo cerrar la publicación. Intentá nuevamente.',
              ),
        );
      },
    });
  }
}
