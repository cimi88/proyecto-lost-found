import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

@Component({
  selector: 'app-my-recovery-requests-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './my-recovery-requests-page.component.html',
  styleUrl: './recovery-requests-page.scss',
})
export class MyRecoveryRequestsPageComponent {
  private readonly recoveryRequests = inject(RecoveryRequestsService);

  readonly cancelForm = new FormControl('', {
    nonNullable: true,
    validators: [
      Validators.required,
      Validators.minLength(3),
      Validators.maxLength(500),
    ],
  });

  readonly requests = signal<RecoveryRequest[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly cancellingId = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly statusLabels = RECOVERY_REQUEST_STATUS_LABELS;
  readonly publicationStatusLabels = PUBLICATION_STATUS_LABELS;
  readonly typeLabels = PUBLICATION_TYPE_LABELS;

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.recoveryRequests.getMine().subscribe({
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

  startCancel(id: string): void {
    this.cancellingId.set(id);
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

    this.submitting.set(true);
    this.actionError.set(null);

    this.recoveryRequests
      .cancel(id, { reason: this.cancelForm.value.trim() })
      .subscribe({
        next: (updated) => {
          this.submitting.set(false);
          this.replaceRequest(updated);
          this.cancelEdit();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.actionError.set(this.describeActionError(error));
        },
      });
  }

  canCancel(request: RecoveryRequest): boolean {
    return request.status === 'PENDING' || request.status === 'APPROVED';
  }

  private replaceRequest(updated: RecoveryRequest): void {
    this.requests.update((requests) =>
      requests.map((request) =>
        request.id === updated.id ? updated : request,
      ),
    );
  }

  private describeLoadError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudieron cargar tus solicitudes. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudieron cargar tus solicitudes. Intentá nuevamente.';
  }

  private describeActionError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo cancelar la solicitud. Intentá nuevamente.';
    }

    if (error.status === 400) {
      const details = (error.error as ApiErrorResponse | null)?.details;
      return (
        details?.find((detail) => detail.field === 'reason')?.message ??
        'El motivo debe tener entre 3 y 500 caracteres.'
      );
    }

    if (error.status === 403) {
      return 'No tenés permiso para cancelar esta solicitud.';
    }

    if (error.status === 404) {
      return 'La solicitud ya no existe.';
    }

    if (error.status === 409) {
      return 'La solicitud cambió de estado. Recargá la lista para ver el estado actual.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. Verificá la conexión e intentá nuevamente.';
    }

    return 'No se pudo cancelar la solicitud. Intentá nuevamente.';
  }
}
