import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ApiErrorResponse } from '../../publications/models/lost-publication.models';
import {
  PUBLICATION_STATUS_LABELS,
  PUBLICATION_TYPE_LABELS,
} from '../../publications/models/publication-search.models';
import {
  RECOVERY_REQUEST_STATUS_LABELS,
  type RecoveryRequest,
} from '../models/recovery-request.models';
import { RecoveryRequestsService } from '../services/recovery-requests.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Component({
  selector: 'app-received-recovery-requests-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './received-recovery-requests-page.component.html',
  styleUrl: './recovery-requests-page.scss',
})
export class ReceivedRecoveryRequestsPageComponent {
  private readonly recoveryRequests = inject(RecoveryRequestsService);
  private readonly route = inject(ActivatedRoute);

  readonly cancelForm = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(500),
    ],
  });
  readonly returnForm = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  readonly requests = signal<RecoveryRequest[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly returningId = signal<string | null>(null);
  readonly publicationFilterId = signal<string | null>(null);
  readonly invalidPublicationFilter = signal(false);
  readonly filteredRequests = computed(() => {
    const publicationId = this.publicationFilterId();

    return publicationId
      ? this.requests().filter(
          (request) => request.publication.id === publicationId,
        )
      : this.requests();
  });
  readonly filteredPublicationTitle = computed(
    () => this.filteredRequests()[0]?.publication.title ?? null,
  );

  readonly statusLabels = RECOVERY_REQUEST_STATUS_LABELS;
  readonly publicationStatusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;

  constructor() {
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe((params) => {
        const requestedPublicationId = params.get('publicationId')?.trim();

        if (!requestedPublicationId) {
          this.publicationFilterId.set(null);
          this.invalidPublicationFilter.set(false);
          return;
        }

        if (!UUID_PATTERN.test(requestedPublicationId)) {
          this.publicationFilterId.set(null);
          this.invalidPublicationFilter.set(true);
          return;
        }

        this.publicationFilterId.set(requestedPublicationId);
        this.invalidPublicationFilter.set(false);
      });

    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.recoveryRequests.getReceived().subscribe({
      next: (requests) => {
        this.loading.set(false);
        this.requests.set(requests);
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.describeLoadError(error));
      },
    });
  }

  approve(id: string): void {
    this.performAction(id, 'approve');
  }

  reject(id: string): void {
    this.performAction(id, 'reject');
  }

  startReturn(id: string): void {
    this.returningId.set(id);
    this.cancellingId.set(null);
    this.cancelForm.reset('');
    this.returnForm.reset('');
    this.actionError.set(null);
  }

  cancelReturn(): void {
    this.returningId.set(null);
    this.returnForm.reset('');
    this.actionError.set(null);
  }

  submitReturn(): void {
    const id = this.returningId();

    if (!id || this.returnForm.invalid || this.actionInProgress()) {
      this.returnForm.markAsTouched();
      return;
    }

    const notes = this.returnForm.value.trim();
    this.actionInProgress.set(id);
    this.actionError.set(null);

    this.recoveryRequests
      .complete(id, notes ? { returnNotes: notes } : {})
      .subscribe({
        next: (updated) => {
          this.actionInProgress.set(null);
          this.replaceRequest(updated);
          this.cancelReturn();
        },
        error: (error: unknown) => {
          this.actionInProgress.set(null);
          this.actionError.set(this.describeReturnError(error));
        },
      });
  }

  startCancel(id: string): void {
    this.cancellingId.set(id);
    this.returningId.set(null);
    this.returnForm.reset('');
    this.actionError.set(null);
    this.cancelForm.reset('');
  }

  cancelEdit(): void {
    this.cancellingId.set(null);
    this.cancelForm.reset('');
    this.actionError.set(null);
  }

  submitCancel(): void {
    const id = this.cancellingId();

    if (!id || this.cancelForm.invalid) {
      this.cancelForm.markAsTouched();
      return;
    }

    this.actionInProgress.set(id);
    this.actionError.set(null);

    this.recoveryRequests
      .cancel(id, { reason: this.cancelForm.value.trim() })
      .subscribe({
        next: (updated) => {
          this.actionInProgress.set(null);
          this.replaceRequest(updated);
          this.cancelEdit();
        },
        error: (error: unknown) => {
          this.actionInProgress.set(null);
          this.actionError.set(this.describeActionError(error));
        },
      });
  }

  private performAction(id: string, action: 'approve' | 'reject'): void {
    this.actionInProgress.set(id);
    this.actionError.set(null);

    this.recoveryRequests[action](id).subscribe({
      next: (updated) => {
        this.actionInProgress.set(null);
        this.replaceRequest(updated);
      },
      error: (error: unknown) => {
        this.actionInProgress.set(null);
        this.actionError.set(this.describeActionError(error));
      },
    });
  }

  private replaceRequest(updated: RecoveryRequest): void {
    this.requests.update((requests) =>
      requests.map((request) =>
        request.id === updated.id ? updated : request,
      ),
    );
  }

  private describeReturnError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo registrar la devolución. Intentá nuevamente.';
    }

    if (error.status === 400) {
      const details = (error.error as ApiErrorResponse | null)?.details;
      return (
        details?.find((detail) => detail.field === 'returnNotes')?.message ??
        'Las notas de devolución no pueden superar 500 caracteres.'
      );
    }

    if (error.status === 403) {
      return 'No tenés permiso para registrar esta devolución.';
    }

    if (error.status === 404) {
      return 'La solicitud o la publicación ya no está disponible.';
    }

    if (error.status === 409) {
      const code = (error.error as ApiErrorResponse | null)?.code;

      if (code === 'RECOVERY_REQUEST_ALREADY_COMPLETED') {
        return 'La devolución ya fue registrada para esta solicitud.';
      }

      if (code === 'RECOVERY_REQUEST_NOT_APPROVED') {
        return 'La solicitud ya no está aprobada. Recargá la lista para ver su estado.';
      }

      if (code === 'RECOVERY_REQUEST_CONFLICT') {
        return 'La reserva de la publicación no es consistente. No se registró la devolución; recargá la lista.';
      }

      return 'La solicitud cambió de estado. Recargá la lista para ver el estado actual.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudo registrar la devolución. Intentá nuevamente.';
  }

  private describeLoadError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudieron cargar las solicitudes recibidas. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudieron cargar las solicitudes recibidas. Intentá nuevamente.';
  }

  private describeActionError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo completar la acción. Intentá nuevamente.';
    }

    if (error.status === 400) {
      const details = (error.error as ApiErrorResponse | null)?.details;
      return (
        details?.find((detail) => detail.field === 'reason')?.message ??
        'El motivo debe tener entre 3 y 500 caracteres.'
      );
    }

    if (error.status === 403) {
      return 'No tenés permiso para gestionar esta solicitud.';
    }

    if (error.status === 404) {
      return 'La solicitud o la publicación ya no está disponible.';
    }

    if (error.status === 409) {
      const code = (error.error as ApiErrorResponse | null)?.code;

      if (code === 'RECOVERY_REQUEST_CONFLICT') {
        return 'La reserva de la publicación es inconsistente. No se modificó nada; recargá la lista.';
      }

      return 'La solicitud cambió de estado. Recargá la lista para ver el estado actual.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudo completar la acción. Intentá nuevamente.';
  }
}
