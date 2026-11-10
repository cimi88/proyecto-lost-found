import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import {
  PUBLICATION_CATEGORIES,
  PUBLICATION_CATEGORY_LABELS,
  type PublicationCategory,
} from '../domain/publication-category';
import type {
  ApiErrorResponse,
  FoundPublicationResponse,
} from '../models/found-publication.models';
import { FoundPublicationsService } from '../services/found-publications.service';
import { characterCount } from '../utils/character-count';
import { eventDateValidator } from '../validators/event-date.validator';

const CATEGORY_PATTERN = new RegExp(
  `^(${PUBLICATION_CATEGORIES.join('|')})$`,
);

@Component({
  selector: 'app-create-found-publication-page',
  imports: [ReactiveFormsModule],
  templateUrl: './create-found-publication-page.component.html',
  styleUrl: './create-found-publication-page.component.scss',
})
export class CreateFoundPublicationPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly foundPublications = inject(FoundPublicationsService);

  readonly categories = PUBLICATION_CATEGORIES;
  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly submitting = signal(false);
  readonly success = signal<FoundPublicationResponse | null>(null);
  readonly errorMessage = signal<string | null>(null);
  readonly fieldErrors = signal<Readonly<Record<string, string>>>({});

  readonly form = this.formBuilder.nonNullable.group({
    title: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(120),
      ],
    ],
    description: [
      '',
      [
        Validators.required,
        Validators.minLength(10),
        Validators.maxLength(1000),
      ],
    ],
    category: ['', [Validators.required, Validators.pattern(CATEGORY_PATTERN)]],
    location: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(120),
      ],
    ],
    eventDate: ['', [Validators.required, eventDateValidator]],
  });
  readonly descriptionCount = characterCount(
    this.form.controls.description,
  );

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  submit(): void {
    this.success.set(null);
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);

    const value = this.form.getRawValue();

    this.foundPublications
      .createFoundPublication({
        ...value,
        category: value.category as PublicationCategory,
      })
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          this.success.set(response);
          this.form.reset();
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.handleError(error);
        },
      });
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.errorMessage.set('Ocurrió un error inesperado. Intentá nuevamente.');
      return;
    }

    if (error.status === 0) {
      this.errorMessage.set(
        'No se pudo conectar con el servidor. Verificá que la API esté en ejecución.',
      );
      return;
    }

    if (error.status === 401) {
      this.errorMessage.set(
        'No se pudo identificar al usuario de demostración. Verificá la configuración local de X-Demo-User-Id.',
      );
      return;
    }

    if (error.status === 400) {
      const body = error.error as ApiErrorResponse | null;

      if (body?.details?.length) {
        const errors: Record<string, string> = {};

        for (const detail of body.details) {
          errors[detail.field] = detail.message;
        }

        this.fieldErrors.set(errors);
      }

      this.errorMessage.set('Revisá los datos del formulario.');
      return;
    }

    this.errorMessage.set(
      'No se pudo registrar el objeto encontrado. Intentá nuevamente.',
    );
  }
}
