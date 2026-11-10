import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import type { OwnPublication } from '../models/publication-management.models';
import { MyPublicationsPageComponent } from './my-publications-page.component';

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

describe('MyPublicationsPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyPublicationsPageComponent],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(MyPublicationsPageComponent);
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
    expect(element(loading, 'my-publications-loading')).not.toBeNull();
    httpMock.expectOne(`${BASE}/mine`).flush([]);
    loading.detectChanges();
    expect(element(loading, 'my-publications-empty')).not.toBeNull();

    const error = render();
    httpMock
      .expectOne(`${BASE}/mine`)
      .flush({ statusCode: 500, message: 'error' }, { status: 500, statusText: 'Server Error' });
    error.detectChanges();
    expect(element(error, 'my-publications-error')?.textContent).toContain(
      'No se pudieron cargar',
    );
    element(error, 'my-publications-retry')?.click();
    httpMock.expectOne(`${BASE}/mine`).flush([]);
  });

  it('shows all statuses but actions only for ACTIVE', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine`).flush([
      buildPublication(),
      buildPublication({ id: SECOND_ID, status: 'RESERVED' }),
      buildPublication({ id: '33333333-3333-4333-8333-333333333333', status: 'RETURNED' }),
      buildPublication({ id: '44444444-4444-4444-8444-444444444444', status: 'CLOSED' }),
    ]);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Reservada');
    expect(fixture.nativeElement.textContent).toContain('Devuelta');
    expect(fixture.nativeElement.textContent).toContain('Cerrada');
    expect(element(fixture, `my-publication-edit-${ID}`)).not.toBeNull();
    expect(element(fixture, `my-publication-close-${ID}`)).not.toBeNull();
    expect(
      element(fixture, `my-publication-requests-${ID}`)?.getAttribute('href'),
    ).toContain(`publicationId=${ID}`);
    expect(element(fixture, `my-publication-edit-${SECOND_ID}`)).toBeNull();
    expect(element(fixture, `my-publication-close-${SECOND_ID}`)).toBeNull();
    expect(
      element(fixture, 'my-publication-edit-33333333-3333-4333-8333-333333333333'),
    ).toBeNull();
    expect(
      element(fixture, 'my-publication-close-44444444-4444-4444-8444-444444444444'),
    ).toBeNull();
  });

  it('confirms a close and updates the card without reloading', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine`).flush([buildPublication()]);
    fixture.detectChanges();

    element(fixture, `my-publication-close-${ID}`)?.click();
    fixture.detectChanges();
    expect(element(fixture, `my-publication-close-confirmation-${ID}`)).not.toBeNull();

    element(fixture, `my-publication-close-confirm-${ID}`)?.click();
    const request = httpMock.expectOne(`${BASE}/${ID}/close`);
    expect(request.request.method).toBe('POST');
    request.flush(buildPublication({ status: 'CLOSED' }));
    fixture.detectChanges();

    expect(element(fixture, `my-publication-${ID}`)?.textContent).toContain(
      'Cerrada',
    );
    expect(element(fixture, `my-publication-edit-${ID}`)).toBeNull();
    expect(element(fixture, `my-publication-close-${ID}`)).toBeNull();
    expect(element(fixture, 'my-publications-success')?.textContent).toContain(
      'cerrada correctamente',
    );
  });

  it('shows a clear error when active requests block closing', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine`).flush([buildPublication()]);
    fixture.detectChanges();

    element(fixture, `my-publication-close-${ID}`)?.click();
    fixture.detectChanges();
    element(fixture, `my-publication-close-confirm-${ID}`)?.click();
    httpMock.expectOne(`${BASE}/${ID}/close`).flush(
      {
        statusCode: 409,
        code: 'PUBLICATION_HAS_ACTIVE_REQUESTS',
        message: 'active requests',
      },
      { status: 409, statusText: 'Conflict' },
    );
    fixture.detectChanges();

    expect(element(fixture, 'my-publications-action-error')?.textContent).toContain(
      'solicitudes pendientes o aprobadas',
    );
    expect(element(fixture, 'my-publications-received-link')).not.toBeNull();
    expect(element(fixture, `my-publication-close-${ID}`)).not.toBeNull();
  });
});
