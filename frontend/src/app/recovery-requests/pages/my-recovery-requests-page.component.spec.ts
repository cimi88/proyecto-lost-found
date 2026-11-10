import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import type { RecoveryRequest } from '../models/recovery-request.models';
import { MyRecoveryRequestsPageComponent } from './my-recovery-requests-page.component';

const BASE = `${environment.apiBaseUrl}/v1`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

function buildRequest(
  overrides: Partial<RecoveryRequest> = {},
): RecoveryRequest {
  return {
    id: REQUEST_ID,
    status: 'PENDING',
    notes: 'Tiene una marca azul.',
    cancellationReason: null,
    completedAt: null,
    returnNotes: null,
    createdAt: '2026-11-07T10:00:00.000Z',
    updatedAt: '2026-11-07T10:00:00.000Z',
    publication: {
      id: PUBLICATION_ID,
      type: 'FOUND',
      status: 'ACTIVE',
      title: 'Mochila negra',
      description: 'Mochila negra con una marca azul.',
      category: 'BAGS',
      location: 'Plaza Central',
      eventDate: '2026-11-01',
      createdAt: '2026-11-06T10:00:00.000Z',
    },
    requesterDisplayName: 'Solicitante Demo',
    ...overrides,
  };
}

describe('MyRecoveryRequestsPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(MyRecoveryRequestsPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function panel(testId: string, fixture: ReturnType<typeof render>) {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
  }

  it('renders own requests with status, notes and date labels', () => {
    const fixture = render();

    expect(panel('my-requests-loading', fixture)).not.toBeNull();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([
      buildRequest(),
    ]);
    fixture.detectChanges();

    const card = panel(`my-request-${REQUEST_ID}`, fixture);

    expect(card?.textContent).toContain('Pendiente');
    expect(card?.textContent).toContain('Mochila negra');
    expect(card?.textContent).toContain('Tiene una marca azul.');
    expect(card?.textContent).toContain('Creada');
    expect(card?.textContent).toContain('Última actualización');
    expect(card?.textContent).not.toContain('Aprobada el');
    expect(card?.textContent).not.toContain('@');
    expect(card?.textContent).not.toContain(PUBLICATION_ID);
  });

  it('cancels a pending request with a reason and updates the card', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/mine`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    panel(`cancel-open-${REQUEST_ID}`, fixture)?.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.cancelForm.setValue('  Ya lo encontré.  ');
    component.submitCancel();

    const request = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/cancel`,
    );
    expect(request.request.body).toEqual({ reason: 'Ya lo encontré.' });
    request.flush(
      buildRequest({
        status: 'CANCELLED',
        cancellationReason: 'Ya lo encontré.',
      }),
    );
    fixture.detectChanges();

    const card = panel(`my-request-${REQUEST_ID}`, fixture);
    expect(card?.textContent).toContain('Cancelada');
    expect(card?.textContent).toContain('Motivo de cancelación');
    expect(panel(`cancel-open-${REQUEST_ID}`, fixture)).toBeNull();
  });

  it('allows cancelling an approved request', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([
      buildRequest({
        status: 'APPROVED',
        publication: { ...buildRequest().publication, status: 'RESERVED' },
      }),
    ]);
    fixture.detectChanges();

    expect(panel(`cancel-open-${REQUEST_ID}`, fixture)).not.toBeNull();
    expect(
      panel(`my-request-${REQUEST_ID}`, fixture)?.textContent,
    ).toContain('Reservada');
  });

  it('shows a completed request with return date and notes', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([
      buildRequest({
        status: 'COMPLETED',
        completedAt: '2026-11-08T10:00:00.000Z',
        returnNotes: 'Entregado en la puerta.',
        publication: {
          ...buildRequest().publication,
          status: 'RETURNED',
        },
      }),
    ]);
    fixture.detectChanges();

    const card = panel(`my-request-${REQUEST_ID}`, fixture);
    expect(card?.textContent).toContain('Completada');
    expect(card?.textContent).toContain('Devuelta');
    expect(card?.textContent).toContain('08/11/2026');
    expect(card?.textContent).toContain('Entregado en la puerta.');
    expect(panel(`cancel-open-${REQUEST_ID}`, fixture)).toBeNull();
  });

  it('shows the empty state and retries an error', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();
    expect(panel('my-requests-empty', fixture)).not.toBeNull();

    const failing = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/mine`)
      .flush(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    failing.detectChanges();

    expect(panel('my-requests-error', failing)).not.toBeNull();
    panel('my-requests-retry', failing)?.click();
    failing.detectChanges();

    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    failing.detectChanges();

    expect(panel('my-requests-empty', failing)).not.toBeNull();
  });
});
