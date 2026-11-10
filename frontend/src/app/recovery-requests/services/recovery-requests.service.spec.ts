import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import { DEMO_USER_A_ID, DemoSessionService } from '../../core/demo-session.service';
import type { RecoveryRequest } from '../models/recovery-request.models';
import { RecoveryRequestsService } from './recovery-requests.service';

const BASE = `${environment.apiBaseUrl}/v1`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';

const REQUEST: RecoveryRequest = {
  id: REQUEST_ID,
  status: 'PENDING',
  notes: null,
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

describe('RecoveryRequestsService', () => {
  let service: RecoveryRequestsService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(RecoveryRequestsService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('creates a request for a publication with the demo identity', () => {
    let response: RecoveryRequest | undefined;

    service
      .create(PUBLICATION_ID, { notes: 'Marca azul' })
      .subscribe((value) => (response = value));

    const request = httpMock.expectOne(
      `${BASE}/publications/${PUBLICATION_ID}/recovery-requests`,
    );
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ notes: 'Marca azul' });
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );
    request.flush(REQUEST);

    expect(response).toEqual(REQUEST);
  });

  it('loads mine and received lists', () => {
    service.getMine().subscribe();
    httpMock.expectOne(`${BASE}/recovery-requests/mine`).flush([REQUEST]);

    service.getReceived().subscribe();
    const received = httpMock.expectOne(`${BASE}/recovery-requests/received`);
    expect(received.request.method).toBe('GET');
    received.flush([REQUEST]);
  });

  it('approves, rejects and cancels a request', () => {
    service.approve(REQUEST_ID).subscribe();
    const approve = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/approve`,
    );
    expect(approve.request.method).toBe('POST');
    approve.flush({ ...REQUEST, status: 'APPROVED' });

    service.reject(REQUEST_ID).subscribe();
    httpMock
      .expectOne(`${BASE}/recovery-requests/${REQUEST_ID}/reject`)
      .flush({ ...REQUEST, status: 'REJECTED' });

    service.cancel(REQUEST_ID, { reason: 'Motivo válido' }).subscribe();
    const cancel = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/cancel`,
    );
    expect(cancel.request.body).toEqual({ reason: 'Motivo válido' });
    cancel.flush({ ...REQUEST, status: 'CANCELLED' });

    service.complete(REQUEST_ID, { returnNotes: 'Entregado.' }).subscribe();
    const complete = httpMock.expectOne(
      `${BASE}/recovery-requests/${REQUEST_ID}/complete`,
    );
    expect(complete.request.body).toEqual({ returnNotes: 'Entregado.' });
    complete.flush({
      ...REQUEST,
      status: 'COMPLETED',
      completedAt: '2026-11-08T10:00:00.000Z',
      returnNotes: 'Entregado.',
      publication: { ...REQUEST.publication, status: 'RETURNED' },
    });
  });

  it('encodes identifiers in URLs', () => {
    service.create('id with spaces', {}).subscribe();
    httpMock
      .expectOne(`${BASE}/publications/id%20with%20spaces/recovery-requests`)
      .flush(REQUEST);

    service.approve('id with spaces').subscribe();
    httpMock
      .expectOne(`${BASE}/recovery-requests/id%20with%20spaces/approve`)
      .flush(REQUEST);

    service.complete('id with spaces', {}).subscribe();
    httpMock
      .expectOne(`${BASE}/recovery-requests/id%20with%20spaces/complete`)
      .flush(REQUEST);
  });
});
