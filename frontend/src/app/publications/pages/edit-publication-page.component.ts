import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  PUBLICATION_CATEGORIES,
  PUBLICATION_CATEGORY_LABELS,
  type PublicationCategory,
} from '../domain/publication-category';
import type { OwnPublication } from '../models/publication-management.models';
import type { ApiErrorResponse } from '../models/publication-search.models';
import { PublicationManagementService } from '../services/publication-management.service';
import { characterCount } from '../utils/character-count';
import { describeManagementError } from '../utils/publication-management-error';
import { eventDateValidator } from '../validators/event-date.validator';

const CATEGORY_PATTERN = new RegExp(
  `^(${PUBLICATION_CATEGORIES.join('|')})$`,
);

@Component({
  selector: 'app-edit-publication-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './edit-publication-page.component.html',
  styleUrl: './edit-publication-page.component.scss',
})
export class EditPublicationPageComponent {
  private readonly formBuilder = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly publicationManagement = inject(
    PublicationManagementService,
  );

  readonly categories = PUBLICATION_CATEGORIES;
  readonly categoryLabels = PUBLICATION_CATEGORY_LABELS;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly publicationId = signal('');
  readonly publication = signal<OwnPublication | null>(null);
  readonly loading = signal(false);
  readonly notFound = signal(false);
  readonly notEditable = signal(false);
  readonly submitting = signal(false);
  readonly loadError = signal<string | null>(null);
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

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const id = params.get('id') ?? '';
      this.publicationId.set(id);
      this.load(id);
    });
  }

  fieldError(field: string): string | null {
    return this.fieldErrors()[field] ?? null;
  }

  submit(): void {
    this.errorMessage.set(null);
    this.fieldErrors.set({});

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const id = this.publicationId();
    const value = this.form.getRawValue();

    this.submitting.set(true);
    this.publicationManagement
      .update(id, {
        ...value,
        category: value.category as PublicationCategory,
      })
      .subscribe({
        next: (published) => {
          this.submitting.set(false);
          void this.router.navigate(['/my-publications'], {
            queryParams: { updated: published.id },
          });
        },
        error: (error: unknown) => {
          this.submitting.set(false);
          this.handleError(error);
        },
      });
  }

  private load(id: string): void {
    this.loading.set(true);
    this.notFound.set(false);
    this.notEditable.set(false);
    this.loadError.set(null);
    this.errorMessage.set(null);
    this.publication.set(null);

    if (!id) {
      this.loading.set(false);
      this.notFound.set(true);
      return;
    }

    this.publicationManagement.getMineById(id).subscribe({
      next: (publication) => {
        this.loading.set(false);
        this.publication.set(publication);

        if (publication.status !== 'ACTIVE') {
          this.notEditable.set(true);
          return;
        }

        this.form.patchValue({
          title: publication.title,
          description: publication.description,
          category: publication.category,
          location: publication.location,
          eventDate: publication.eventDate,
        });
      },
      error: (error: unknown) => {
        this.loading.set(false);

        if (error instanceof HttpErrorResponse && error.status === 404) {
          this.notFound.set(true);
          return;
        }

        this.loadError.set(
          describeManagementError(
            error,
            'No se pudo cargar la publicación. Intentá nuevamente.',
          ),
        );
      },
    });
  }

  private handleError(error: unknown): void {
    if (!(error instanceof HttpErrorResponse)) {
      this.errorMessage.set('Ocurrió un error inesperado. Intentá nuevamente.');
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
      describeManagementError(
        error,
        'No se pudo actualizar la publicación. Intentá nuevamente.',
      ),
    );
  }
}
