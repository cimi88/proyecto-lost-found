import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
  Router,
} from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import type { OwnPublication } from '../models/publication-management.models';
import { EditPublicationPageComponent } from './edit-publication-page.component';

const BASE = `${environment.apiBaseUrl}/v1/publications`;
const ID = '11111111-1111-4111-8111-111111111111';

const PUBLICATION: OwnPublication = {
  id: ID,
  type: 'LOST',
  status: 'ACTIVE',
  title: 'Mochila negra',
  description: 'Mochila negra con una marca azul.',
  category: 'BAGS',
  location: 'Plaza Central',
  eventDate: '2026-11-01',
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

describe('EditPublicationPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPublicationPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: ID })) },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(EditPublicationPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('prefills and updates an ACTIVE publication', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
    fixture.detectChanges();

    expect(fixture.componentInstance.form.controls.title.value).toBe(
      PUBLICATION.title,
    );
    fixture.componentInstance.form.patchValue({
      title: 'Mochila actualizada',
      location: 'Plaza Central, banco 3',
    });
    fixture.componentInstance.submit();

    const request = httpMock.expectOne(`${BASE}/${ID}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toMatchObject({
      title: 'Mochila actualizada',
      location: 'Plaza Central, banco 3',
    });
    expect(request.request.body).not.toHaveProperty('ownerId');
    expect(request.request.body).not.toHaveProperty('status');
    request.flush({ ...PUBLICATION, title: 'Mochila actualizada' });
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(
      ['/my-publications'],
      { queryParams: { updated: ID } },
    );
  });

  it('shows the loaded description count and updates it on edit', () => {
    const fixture = render();
    const component = fixture.componentInstance;
    const counter = () =>
      fixture.nativeElement.querySelector(
        '[data-testid="edit-description-counter"]',
      )?.textContent?.trim();

    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
    fixture.detectChanges();

    expect(counter()).toBe(
      `${PUBLICATION.description.length} / 1000`,
    );

    component.form.controls.description.setValue('Texto actualizado');
    fixture.detectChanges();
    expect(counter()).toBe('17 / 1000');
    expect(
      fixture.nativeElement.querySelector('#edit-description')?.getAttribute(
        'maxlength',
      ),
    ).toBe('1000');
  });

  it('does not show the form for non-ACTIVE publications', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/mine/${ID}`)
      .flush({ ...PUBLICATION, status: 'RESERVED' });
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="edit-publication-not-editable"]',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('form.publication-form'),
    ).toBeNull();
  });

  it('shows validation errors returned by the backend', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
    fixture.detectChanges();

    fixture.componentInstance.submit();
    httpMock.expectOne(`${BASE}/${ID}`).flush(
      {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: [{ field: 'title', message: 'Título inválido.' }],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="edit-publication-form-error"]',
      )?.textContent,
    ).toContain('Revisá los datos');
    expect(fixture.componentInstance.fieldError('title')).toBe('Título inválido.');
  });

  it('does not submit an invalid form', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
    fixture.detectChanges();

    fixture.componentInstance.form.patchValue({ title: 'x' });
    fixture.componentInstance.submit();

    httpMock.expectNone(`${BASE}/${ID}`);
  });
});
