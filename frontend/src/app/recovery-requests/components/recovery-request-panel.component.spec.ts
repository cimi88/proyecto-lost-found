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
import { RecoveryRequestPanelComponent } from './recovery-request-panel.component';

const BASE = `${environment.apiBaseUrl}/v1`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const REQUEST: RecoveryRequest = {
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
};

describe('RecoveryRequestPanelComponent', () => {
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
    const fixture = TestBed.createComponent(RecoveryRequestPanelComponent);
    fixture.componentRef.setInput('publicationId', PUBLICATION_ID);
    fixture.detectChanges();

    return fixture;
  }

  function panel(testId: string, fixture: ReturnType<typeof render>) {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
  }

  it('loads the active own request and shows it without the form', () => {
    const fixture = render();

    expect(panel('request-loading', fixture)).not.toBeNull();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([REQUEST]);
    fixture.detectChanges();

    expect(panel('own-request', fixture)?.textContent).toContain(
      'Pendiente',
    );
    expect(panel('own-request', fixture)?.textContent).toContain(
      'Tiene una marca azul.',
    );
    expect(panel('own-request', fixture)?.textContent).toContain('Creada');
    expect(panel('own-request', fixture)?.textContent).toContain(
      'Última actualización',
    );
    expect(panel('request-notes', fixture)).toBeNull();
  });

  it('creates a request with trimmed notes', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.requestForm.setValue('  Tiene una marca azul.  ');
    component.submit();

    const request = httpMock.expectOne(
      `${BASE}/publications/${PUBLICATION_ID}/recovery-requests`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      notes: 'Tiene una marca azul.',
    });
    request.flush(REQUEST);
    fixture.detectChanges();

    expect(panel('own-request', fixture)).not.toBeNull();
    expect(panel('request-success', fixture)?.textContent).toContain(
      'Solicitud enviada',
    );
  });

  it('sends with Enter and keeps modified Enter for new lines', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.requestForm.setValue('Tiene una marca azul.');

    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    component.onNotesKeydown(enter);

    expect(enter.defaultPrevented).toBe(true);
    httpMock
      .expectOne(`${BASE}/publications/${PUBLICATION_ID}/recovery-requests`)
      .flush(REQUEST);
    fixture.detectChanges();

    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      component.onNotesKeydown(event);
      expect(event.defaultPrevented).toBe(false);
    }
    httpMock.expectNone(
      `${BASE}/publications/${PUBLICATION_ID}/recovery-requests`,
    );
  });

  it('ignores Enter during IME composition and duplicate submissions', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    const component = fixture.componentInstance;
    component.requestForm.setValue('Texto compuesto');

    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composing, 'isComposing', { value: true });
    component.onNotesKeydown(composing);
    expect(composing.defaultPrevented).toBe(false);

    component.submitting.set(true);
    component.submit();
    httpMock.expectNone(
      `${BASE}/publications/${PUBLICATION_ID}/recovery-requests`,
    );
  });

  it('shows a notes validation message from the API', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    fixture.componentInstance.submit();
    httpMock
      .expectOne(`${BASE}/publications/${PUBLICATION_ID}/recovery-requests`)
      .flush(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: [{ field: 'notes', message: 'Las notas son inválidas.' }],
        },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(panel('request-field-error', fixture)?.textContent).toContain(
      'Las notas son inválidas.',
    );
  });

  it('reloads the active request after a duplicate conflict', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    fixture.componentInstance.submit();
    httpMock
      .expectOne(`${BASE}/publications/${PUBLICATION_ID}/recovery-requests`)
      .flush(
        {
          statusCode: 409,
          code: 'RECOVERY_REQUEST_DUPLICATE',
          message: 'duplicate',
        },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(panel('request-error', fixture)?.textContent).toContain(
      'solicitud activa',
    );

    panel('request-retry-button', fixture)?.click();
    fixture.detectChanges();

    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([REQUEST]);
    fixture.detectChanges();

    expect(panel('own-request', fixture)).not.toBeNull();
  });

  it('shows an error and retries the own request query', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/recovery-requests/mine`)
      .flush(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    fixture.detectChanges();

    expect(panel('request-error', fixture)).not.toBeNull();
    panel('request-retry-button', fixture)?.click();
    fixture.detectChanges();

    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([]);
    fixture.detectChanges();

    expect(panel('request-error', fixture)).toBeNull();
    expect(panel('request-submit', fixture)).not.toBeNull();
  });
});
