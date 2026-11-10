import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import {
  Component,
  OnInit,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { ApiErrorResponse } from '../../publications/models/lost-publication.models';
import {
  RECOVERY_REQUEST_STATUS_LABELS,
  isActiveRecoveryRequest,
  type RecoveryRequest,
} from '../models/recovery-request.models';
import { RecoveryRequestsService } from '../services/recovery-requests.service';

@Component({
  selector: 'app-recovery-request-panel',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './recovery-request-panel.component.html',
  styleUrl: './recovery-request-panel.component.scss',
})
export class RecoveryRequestPanelComponent implements OnInit {
  private readonly recoveryRequests = inject(RecoveryRequestsService);
  private readonly route = inject(ActivatedRoute);

  readonly publicationId = input.required<string>();

  readonly requestForm = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(500)],
  });

  readonly loading = signal(false);
  readonly submitting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldError = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);
  readonly activeRequest = signal<RecoveryRequest | null>(null);

  readonly statusLabels = RECOVERY_REQUEST_STATUS_LABELS;

  constructor() {
    afterNextRender(() => {
      if (this.route.snapshot.fragment !== 'solicitar-recuperacion') {
        return;
      }

      const section = document.getElementById('solicitar-recuperacion');
      section?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
      const heading = section?.querySelector('h2');
      heading?.focus();
    });
  }

  ngOnInit(): void {
    this.loadOwnRequest();
  }

  loadOwnRequest(): void {
    this.loading.set(true);
    this.errorMessage.set(null);

    this.recoveryRequests.getMine().subscribe({
      next: (requests) => {
        this.loading.set(false);
        this.activeRequest.set(
          requests.find(
            (request) =>
              request.publication.id === this.publicationId() &&
              isActiveRecoveryRequest(request),
          ) ?? null,
        );
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.describeLoadError(error));
      },
    });
  }

  submit(): void {
    if (this.submitting()) {
      return;
    }

    this.fieldError.set(null);
    this.errorMessage.set(null);
    this.successMessage.set(null);

    if (this.requestForm.invalid) {
      this.requestForm.markAsTouched();
      return;
    }

    const notes = this.requestForm.value.trim();
    this.submitting.set(true);

    this.recoveryRequests
      .create(this.publicationId(), notes ? { notes } : {})
      .subscribe({
        next: (request) => {
          this.submitting.set(false);
          this.activeRequest.set(request);
          this.successMessage.set(
            'Solicitud enviada. El propietario podrá aprobarla o rechazarla.',
          );
          this.requestForm.reset('');
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.handleSubmitError(error);
        },
      });
  }

  onNotesKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    this.submit();
  }

  private handleSubmitError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.errorMessage.set(
        'No se pudo enviar la solicitud. Intentá nuevamente.',
      );
      return;
    }

    if (error.status === 400) {
      const details = (error.error as ApiErrorResponse | null)?.details;
      const notesError = details?.find((detail) => detail.field === 'notes');

      this.fieldError.set(
        notesError?.message ??
          'Revisá las notas: no pueden superar 500 caracteres.',
      );
      return;
    }

    if (error.status === 403) {
      this.errorMessage.set(
        'No podés solicitar tu propia publicación encontrada.',
      );
      return;
    }

    if (error.status === 404) {
      this.errorMessage.set(
        'La publicación ya no está disponible para solicitudes.',
      );
      return;
    }

    if (error.status === 409) {
      const code = (error.error as ApiErrorResponse | null)?.code;

      if (code === 'RECOVERY_REQUEST_DUPLICATE') {
        this.errorMessage.set(
          'Ya tenés una solicitud activa para esta publicación. Reintentá para ver su estado.',
        );
        return;
      }

      this.errorMessage.set(
        'La solicitud no pudo crearse porque el estado cambió. Recargá e intentá nuevamente.',
      );
      return;
    }

    if (error.status === 401) {
      this.errorMessage.set(
        'La identidad demo no está disponible. Verificá la configuración local.',
      );
      return;
    }

    if (error.status === 0) {
      this.errorMessage.set(
        'No se pudo conectar con el servidor. Verificá que la API esté en ejecución.',
      );
      return;
    }

    this.errorMessage.set(
      'No se pudo enviar la solicitud. Intentá nuevamente.',
    );
  }

  private describeLoadError(error: unknown): string {
    if (error instanceof HttpErrorResponse && error.status === 0) {
      return 'No se pudo verificar tu solicitud. Verificá la conexión e intentá nuevamente.';
    }

    if (error instanceof HttpErrorResponse && error.status === 401) {
      return 'La identidad demo no está disponible. Verificá la configuración local.';
    }

    return 'No se pudo verificar tu solicitud. Intentá nuevamente.';
  }
}
