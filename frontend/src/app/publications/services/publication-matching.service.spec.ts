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
import type { PublicationMatchesResponse } from '../models/publication-matching.models';
import { PublicationMatchingService } from './publication-matching.service';

const ENDPOINT = `${environment.apiBaseUrl}/v1/publications`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';
const SUGGESTIONS: PublicationMatchesResponse = {
  publicationId: PUBLICATION_ID,
  items: [
    {
      id: '33333333-3333-4333-8333-333333333333',
      status: 'SUGGESTED',
      candidate: {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'FOUND',
        status: 'ACTIVE',
        title: 'Billetera negra encontrada',
        description: 'Billetera de cuero con tarjetas encontradas.',
        category: 'BAGS',
        location: 'Plaza Central',
        eventDate: '2026-11-01',
        createdAt: '2026-11-06T10:00:00.000Z',
      },
      score: 0.84,
      scoreBreakdown: {
        text: { score: 0.8, weight: 0.5, contribution: 0.4 },
        category: { score: 1, weight: 0.2, contribution: 0.2 },
        date: { score: 1, weight: 0.15, contribution: 0.15 },
        location: { score: 0.6, weight: 0.15, contribution: 0.09 },
      },
      eventDateDifferenceDays: 0,
    },
  ],
};

describe('PublicationMatchingService', () => {
  let matching: PublicationMatchingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    matching = TestBed.inject(PublicationMatchingService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads public match suggestions for a publication', () => {
    let response: PublicationMatchesResponse | undefined;

    matching.getSuggestions(PUBLICATION_ID).subscribe((value) => {
      response = value;
    });

    const request = httpMock.expectOne(
      `${ENDPOINT}/${PUBLICATION_ID}/matches`,
    );
    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );
    request.flush(SUGGESTIONS);

    expect(response).toEqual(SUGGESTIONS);
    expect(response?.items[0].candidate).not.toHaveProperty('ownerId');
  });

  it('encodes the source identifier in the URL', () => {
    matching.getSuggestions('id with spaces').subscribe();

    const request = httpMock.expectOne(
      `${ENDPOINT}/id%20with%20spaces/matches`,
    );

    expect(request.request.method).toBe('GET');
    request.flush({ publicationId: 'id with spaces', items: [] });
  });
});
