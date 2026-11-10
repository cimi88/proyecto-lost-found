import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import type { OwnPublication } from '../models/publication-management.models';
import { AdminPublicationsPageComponent } from './admin-publications-page.component';

const ADMIN_BASE = `${environment.apiBaseUrl}/v1/admin/publications`;
const BASE = `${environment.apiBaseUrl}/v1/publications`;
const ID = '11111111-1111-4111-8111-111111111111';
const SECOND_ID = '22222222-2222-4222-8222-222222222222';

function buildPublication(
  overrides: Partial<OwnPublication> = {},
): OwnPublication {
  return {
    id: ID,
    type: 'FOUND',
    status: 'ACTIVE',
    title: 'Mochila negra',
    description: 'Mochila negra con una marca azul.',
    category: 'BAGS',
    location: 'Plaza Central',
    eventDate: '2026-11-01',
    createdAt: '2026-11-06T10:00:00.000Z',
    updatedAt: '2026-11-06T10:00:00.000Z',
    ...overrides,
  };
}

describe('AdminPublicationsPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPublicationsPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(AdminPublicationsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function element(
    fixture: ReturnType<typeof render>,
    testId: string,
  ): HTMLElement | null {
    return fixture.nativeElement.querySelector(`[data-testid="${testId}"]`);
  }

  it('renders loading, empty and error states', () => {
    const loading = render();
    expect(element(loading, 'admin-publications-loading')).not.toBeNull();
    httpMock.expectOne(ADMIN_BASE).flush([]);
    loading.detectChanges();
    expect(element(loading, 'admin-publications-empty')).not.toBeNull();

    const error = render();
    httpMock
      .expectOne(ADMIN_BASE)
      .flush({ statusCode: 403, code: 'ADMIN_FORBIDDEN', message: 'forbidden' }, { status: 403, statusText: 'Forbidden' });
    error.detectChanges();
    expect(element(error, 'admin-publications-error')?.textContent).toContain(
      'No tenés permiso',
    );
    element(error, 'admin-publications-retry')?.click();
    httpMock.expectOne(ADMIN_BASE).flush([]);
  });

  it('lists only the provided ACTIVE moderation rows and no edit actions', () => {
    const fixture = render();
    httpMock.expectOne(ADMIN_BASE).flush([
      buildPublication(),
      buildPublication({ id: SECOND_ID, title: 'Llaves encontradas' }),
    ]);
    fixture.detectChanges();

    expect(element(fixture, `admin-publication-${ID}`)).not.toBeNull();
    expect(element(fixture, `admin-publication-${SECOND_ID}`)).not.toBeNull();
    expect(element(fixture, `admin-publication-close-${ID}`)).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid^="admin-publication-edit-"]'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid^="admin-publication-requests-"]'),
    ).toBeNull();
  });

  it('confirms a close and removes the row without reloading', () => {
    const fixture = render();
    httpMock.expectOne(ADMIN_BASE).flush([buildPublication()]);
    fixture.detectChanges();

    element(fixture, `admin-publication-close-${ID}`)?.click();
    fixture.detectChanges();
    expect(
      element(fixture, `admin-publication-close-confirmation-${ID}`),
    ).not.toBeNull();

    element(fixture, `admin-publication-close-confirm-${ID}`)?.click();
    const request = httpMock.expectOne(`${BASE}/${ID}/close`);
    expect(request.request.method).toBe('POST');
    request.flush(buildPublication({ status: 'CLOSED' }));
    fixture.detectChanges();

    expect(element(fixture, `admin-publication-${ID}`)).toBeNull();
    expect(element(fixture, 'admin-publications-empty')).not.toBeNull();
    expect(element(fixture, 'admin-publications-success')?.textContent).toContain(
      'cerrada correctamente',
    );
  });

  it('explains active requests and keeps the row available', () => {
    const fixture = render();
    httpMock.expectOne(ADMIN_BASE).flush([buildPublication()]);
    fixture.detectChanges();

    element(fixture, `admin-publication-close-${ID}`)?.click();
    fixture.detectChanges();
    element(fixture, `admin-publication-close-confirm-${ID}`)?.click();
    httpMock.expectOne(`${BASE}/${ID}/close`).flush(
      {
        statusCode: 409,
        code: 'PUBLICATION_HAS_ACTIVE_REQUESTS',
        message: 'active requests',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(
      element(fixture, 'admin-publications-action-error')?.textContent,
    ).toContain('usuarios involucrados');
    expect(element(fixture, `admin-publication-${ID}`)).not.toBeNull();
  });

  it('handles non-closeable state errors', () => {
    const fixture = render();
    httpMock.expectOne(ADMIN_BASE).flush([buildPublication()]);
    fixture.detectChanges();

    element(fixture, `admin-publication-close-${ID}`)?.click();
    fixture.detectChanges();
    element(fixture, `admin-publication-close-confirm-${ID}`)?.click();
    httpMock.expectOne(`${BASE}/${ID}/close`).flush(
      {
        statusCode: 409,
        code: 'PUBLICATION_NOT_CLOSABLE',
        message: 'not closable',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(
      element(fixture, 'admin-publications-action-error')?.textContent,
    ).toContain('Solo se pueden cerrar publicaciones activas');
  });
});
