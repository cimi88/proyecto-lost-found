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
import { PublicationSearchService } from './publication-search.service';

const ENDPOINT = `${environment.apiBaseUrl}/v1/publications`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';

describe('PublicationSearchService', () => {
  let service: PublicationSearchService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    service = TestBed.inject(PublicationSearchService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('searches with q, page and pageSize as query parameters', () => {
    service.search({ q: 'mochila', page: 2, pageSize: 12 }).subscribe();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === ENDPOINT && candidate.method === 'GET',
    );

    expect(request.request.params.get('q')).toBe('mochila');
    expect(request.request.params.get('page')).toBe('2');
    expect(request.request.params.get('pageSize')).toBe('12');
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );

    request.flush({
      items: [],
      page: 2,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('trims the search term before sending it', () => {
    service.search({ q: '  llaves  ', page: 1, pageSize: 12 }).subscribe();

    const request = httpMock.expectOne((candidate) => candidate.url === ENDPOINT);

    expect(request.request.params.get('q')).toBe('llaves');

    request.flush({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('omits q when it is empty or only whitespace', () => {
    service.search({ q: '   ', page: 1, pageSize: 12 }).subscribe();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === ENDPOINT,
    );

    expect(request.request.params.has('q')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('12');

    request.flush({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('sends every filter and the requested sort', () => {
    service
      .search({
        q: 'bicicleta',
        type: 'LOST',
        category: 'SPORTS',
        eventDateFrom: '2024-01-01',
        eventDateTo: '2024-12-31',
        sort: 'oldest',
        page: 1,
        pageSize: 12,
      })
      .subscribe();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === ENDPOINT,
    );

    expect(request.request.params.get('q')).toBe('bicicleta');
    expect(request.request.params.get('type')).toBe('LOST');
    expect(request.request.params.get('category')).toBe('SPORTS');
    expect(request.request.params.get('eventDateFrom')).toBe('2024-01-01');
    expect(request.request.params.get('eventDateTo')).toBe('2024-12-31');
    expect(request.request.params.get('sort')).toBe('oldest');

    request.flush({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('omits empty filters and the default recent sort', () => {
    service
      .search({
        type: undefined,
        category: undefined,
        eventDateFrom: '',
        eventDateTo: '',
        sort: 'recent',
        page: 1,
        pageSize: 12,
      })
      .subscribe();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === ENDPOINT,
    );

    for (const name of [
      'type',
      'category',
      'eventDateFrom',
      'eventDateTo',
      'sort',
    ]) {
      expect(request.request.params.has(name)).toBe(false);
    }

    request.flush({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('sends sort=relevance when requested', () => {
    service
      .search({ q: 'llaves', sort: 'relevance', page: 1, pageSize: 12 })
      .subscribe();

    const request = httpMock.expectOne(
      (candidate) => candidate.url === ENDPOINT,
    );

    expect(request.request.params.get('sort')).toBe('relevance');

    request.flush({
      items: [],
      page: 1,
      pageSize: 12,
      total: 0,
      totalPages: 0,
    });
  });

  it('requests the detail of a publication by id', () => {
    service.getById(PUBLICATION_ID).subscribe();

    const request = httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`);

    expect(request.request.method).toBe('GET');

    request.flush({
      id: PUBLICATION_ID,
      type: 'LOST',
      status: 'ACTIVE',
      title: 'Mochila azul',
      description: 'Mochila con cierre roto.',
      category: 'BAGS',
      location: 'Plaza central',
      eventDate: '2024-05-10',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    });
  });

  it('propagates search errors', () => {
    let status: number | undefined;

    service.search({ q: 'mochila', page: 1, pageSize: 12 }).subscribe({
      error: (error: { status?: number }) => {
        status = error.status;
      },
    });

    httpMock.expectOne((candidate) => candidate.url === ENDPOINT).flush(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    expect(status).toBe(500);
  });

  it('propagates not found errors for the detail', () => {
    let status: number | undefined;

    service.getById(PUBLICATION_ID).subscribe({
      error: (error: { status?: number }) => {
        status = error.status;
      },
    });

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(
      {
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication not found',
      },
      { status: 404, statusText: 'Not Found' },
    );

    expect(status).toBe(404);
  });

  it('propagates connection errors', () => {
    let status: number | undefined;

    service.search({ q: 'mochila', page: 1, pageSize: 12 }).subscribe({
      error: (error: { status?: number }) => {
        status = error.status;
      },
    });

    httpMock
      .expectOne((candidate) => candidate.url === ENDPOINT)
      .flush(new ErrorEvent('NetworkError'), {
        status: 0,
        statusText: 'Unknown Error',
      });

    expect(status).toBe(0);
  });
});
