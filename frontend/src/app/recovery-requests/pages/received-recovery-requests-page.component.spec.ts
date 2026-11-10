import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import type { ParamMap } from '@angular/router';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import type { RecoveryRequest } from '../models/recovery-request.models';
import { ReceivedRecoveryRequestsPageComponent } from './received-recovery-requests-page.component';

const BASE = `${environment.apiBaseUrl}/v1`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const SECOND_PUBLICATION_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const SECOND_REQUEST_ID = '44444444-4444-4444-8444-444444444444';

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

describe('ReceivedRecoveryRequestsPageComponent', () => {
  let httpMock: HttpTestingController;
  let queryParams: BehaviorSubject<ParamMap>;

  beforeEach(async () => {
    queryParams = new BehaviorSubject(convertToParamMap({}));

    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: queryParams.asObservable() },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(
      ReceivedRecoveryRequestsPageComponent,
    );
    fixture.detectChanges();
    return fixture;
  }

  function panel(testId: string, fixture: ReturnType<typeof render>) {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
  }

  it('renders received requests with the visible requester name', () => {
    const fixture = render();

    expect(panel('received-requests-loading', fixture)).not.toBeNull();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    const card = panel(`received-request-${REQUEST_ID}`, fixture);

    expect(card?.textContent).toContain('Solicitante Demo');
    expect(card?.textContent).toContain('Tiene una marca azul.');
    expect(card?.textContent).toContain('Pendiente');
    expect(card?.textContent).toContain('Creada');
    expect(card?.textContent).toContain('Última actualización');
    expect(card?.textContent).not.toContain('@');
    expect(card?.textContent).not.toContain(PUBLICATION_ID);
    expect(panel(`approve-${REQUEST_ID}`, fixture)).not.toBeNull();
    expect(panel(`reject-${REQUEST_ID}`, fixture)).not.toBeNull();
  });

  it('filters received requests by publicationId and offers a clear-filter link', () => {
    queryParams.next(convertToParamMap({ publicationId: PUBLICATION_ID }));
    const fixture = render();

    httpMock.expectOne(`${BASE}/recovery-requests/received`).flush([
      buildRequest(),
      buildRequest({
        id: SECOND_REQUEST_ID,
        publication: {
          ...buildRequest().publication,
          id: SECOND_PUBLICATION_ID,
          title: 'Llaves encontradas',
        },
      }),
    ]);
    fixture.detectChanges();

    expect(panel(`received-request-${REQUEST_ID}`, fixture)).not.toBeNull();
    expect(panel(`received-request-${SECOND_REQUEST_ID}`, fixture)).toBeNull();
    expect(
      panel('received-requests-filter-banner', fixture)?.textContent,
    ).toContain('Mochila negra');
    expect(
      panel('received-requests-clear-filter', fixture)?.getAttribute('href'),
    ).toBe('/recovery-requests/received');
  });

  it('shows an empty filtered state when the publication has no requests', () => {
    queryParams.next(
      convertToParamMap({ publicationId: SECOND_PUBLICATION_ID }),
    );
    const fixture = render();

    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    expect(panel('received-requests-filter-empty', fixture)).not.toBeNull();
    expect(panel(`received-request-${REQUEST_ID}`, fixture)).toBeNull();
    expect(panel('received-requests-clear-filter', fixture)).not.toBeNull();
  });

  it('warns and shows all requests when publicationId is invalid', () => {
    queryParams.next(convertToParamMap({ publicationId: 'invalid' }));
    const fixture = render();

    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    expect(panel('received-requests-invalid-filter', fixture)).not.toBeNull();
    expect(panel(`received-request-${REQUEST_ID}`, fixture)).not.toBeNull();
    expect(panel('received-requests-filter-banner', fixture)).toBeNull();
  });

  it('approves a request and shows the reservation actions', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    panel(`approve-${REQUEST_ID}`, fixture)?.click();
    httpMock
      .expectOne(`${BASE}/recovery-requests/${REQUEST_ID}/approve`)
      .flush(
        buildRequest({
          status: 'APPROVED',
          publication: {
            ...buildRequest().publication,
            status: 'RESERVED',
          },
        }),
      );
    fixture.detectChanges();

    const card = panel(`received-request-${REQUEST_ID}`, fixture);
    expect(card?.textContent).toContain('Aprobada');
    expect(card?.textContent).toContain('Reservada');
    expect(panel(`approve-${REQUEST_ID}`, fixture)).toBeNull();
    expect(panel(`received-cancel-open-${REQUEST_ID}`, fixture)).not.toBeNull();
    expect(panel(`received-return-open-${REQUEST_ID}`, fixture)).not.toBeNull();
  });

  it('registers a return with optional notes and updates the card', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([
        buildRequest({
          status: 'APPROVED',
          publication: {
            ...buildRequest().publication,
            status: 'RESERVED',
          },
        }),
      ]);
    fixture.detectChanges();

    panel(`received-return-open-${REQUEST_ID}`, fixture)?.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.returnForm.setValue('  Entregado en la puerta.  ');
    component.submitReturn();

    const request = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/complete`,
    );
    expect(request.request.body).toEqual({
      returnNotes: 'Entregado en la puerta.',
    });
    request.flush(
      buildRequest({
        status: 'COMPLETED',
        completedAt: '2026-11-08T10:00:00.000Z',
        returnNotes: 'Entregado en la puerta.',
        publication: {
          ...buildRequest().publication,
          status: 'RETURNED',
        },
      }),
    );
    fixture.detectChanges();

    const card = panel(`received-request-${REQUEST_ID}`, fixture);
    expect(card?.textContent).toContain('Completada');
    expect(card?.textContent).toContain('Devuelta');
    expect(card?.textContent).toContain('08/11/2026');
    expect(card?.textContent).toContain('Entregado en la puerta.');
    expect(panel(`received-return-open-${REQUEST_ID}`, fixture)).toBeNull();
    expect(panel(`received-cancel-open-${REQUEST_ID}`, fixture)).toBeNull();
  });

  it('allows a return without notes and blocks duplicate submissions', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([
        buildRequest({
          status: 'APPROVED',
          publication: {
            ...buildRequest().publication,
            status: 'RESERVED',
          },
        }),
      ]);
    fixture.detectChanges();

    panel(`received-return-open-${REQUEST_ID}`, fixture)?.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.submitReturn();

    const request = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/complete`,
    );
    expect(request.request.body).toEqual({});

    component.submitReturn();
    httpMock.expectNone(
      `${BASE}/recovery-requests/${REQUEST_ID}/complete`,
    );

    request.flush(
      buildRequest({
        status: 'COMPLETED',
        completedAt: '2026-11-08T10:00:00.000Z',
        publication: {
          ...buildRequest().publication,
          status: 'RETURNED',
        },
      }),
    );
    fixture.detectChanges();

    expect(
      panel(`received-request-${REQUEST_ID}`, fixture)?.textContent,
    ).toContain('Completada');
  });

  it('shows a completion conflict without losing the card', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([
        buildRequest({
          status: 'APPROVED',
          publication: {
            ...buildRequest().publication,
            status: 'RESERVED',
          },
        }),
      ]);
    fixture.detectChanges();

    panel(`received-return-open-${REQUEST_ID}`, fixture)?.click();
    fixture.detectChanges();
    fixture.componentInstance.submitReturn();

    httpMock
      .expectOne(`${BASE}/recovery-requests/${REQUEST_ID}/complete`)
      .flush(
        {
          statusCode: 409,
          code: 'RECOVERY_REQUEST_ALREADY_COMPLETED',
          message: 'already completed',
        },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(panel('received-requests-action-error', fixture)?.textContent).toContain(
      'ya fue registrada',
    );
    expect(panel(`received-request-${REQUEST_ID}`, fixture)).not.toBeNull();
  });

  it('rejects a pending request', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([buildRequest()]);
    fixture.detectChanges();

    panel(`reject-${REQUEST_ID}`, fixture)?.click();
    httpMock
      .expectOne(`${BASE}/recovery-requests/${REQUEST_ID}/reject`)
      .flush(buildRequest({ status: 'REJECTED' }));
    fixture.detectChanges();

    expect(
      panel(`received-request-${REQUEST_ID}`, fixture)?.textContent,
    ).toContain('Rechazada');
    expect(panel(`approve-${REQUEST_ID}`, fixture)).toBeNull();
  });

  it('cancels an approved reservation with a reason', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush([
        buildRequest({
          status: 'APPROVED',
          publication: {
            ...buildRequest().publication,
            status: 'RESERVED',
          },
        }),
      ]);
    fixture.detectChanges();

    panel(`received-cancel-open-${REQUEST_ID}`, fixture)?.click();
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.cancelForm.setValue('El solicitante no respondió.');
    component.submitCancel();

    const request = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/cancel`,
    );
    expect(request.request.body).toEqual({
      reason: 'El solicitante no respondió.',
    });
    request.flush(
      buildRequest({
        status: 'CANCELLED',
        cancellationReason: 'El solicitante no respondió.',
        publication: {
          ...buildRequest().publication,
          status: 'ACTIVE',
        },
      }),
    );
    fixture.detectChanges();

    const card = panel(`received-request-${REQUEST_ID}`, fixture);
    expect(card?.textContent).toContain('Cancelada');
    expect(card?.textContent).toContain('Activa');
  });

  it('shows the empty state and an error with retry', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/received`).flush([]);
    fixture.detectChanges();
    expect(panel('received-requests-empty', fixture)).not.toBeNull();

    const failing = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/received`)
      .flush(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    failing.detectChanges();

    expect(panel('received-requests-error', failing)).not.toBeNull();
    panel('received-requests-retry', failing)?.click();
    failing.detectChanges();

    httpMock.expectOne(`${BASE}/recovery-requests/received`).flush([]);
    failing.detectChanges();

    expect(panel('received-requests-empty', failing)).not.toBeNull();
  });
});
