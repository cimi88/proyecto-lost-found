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
  provideRouter,
  type Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import { DEMO_USER_A_ID, DemoSessionService } from '../../core/demo-session.service';
import type { PublicationDetail } from '../models/publication-search.models';
import type {
  PublicationMatchSuggestion,
  PublicationMatchesResponse,
} from '../models/publication-matching.models';
import { PublicationDetailPageComponent } from './publication-detail-page.component';

const ENDPOINT = `${environment.apiBaseUrl}/v1/publications`;
const PUBLICATION_ID = '11111111-1111-4111-8111-111111111111';

const PUBLICATION: PublicationDetail = {
  id: PUBLICATION_ID,
  type: 'LOST',
  status: 'ACTIVE',
  title: 'Mochila gris de gimnasio',
  description: 'Mochila gris con toalla azul y un candado pequeño.',
  category: 'BAGS',
  location: 'Vestuario del club',
  eventDate: '2024-05-10',
  createdAt: '2026-11-05T10:00:00.000Z',
  updatedAt: '2026-11-06T09:30:00.000Z',
};

const MATCH_ID = '33333333-3333-4333-8333-333333333333';
const CANDIDATE_ID = '22222222-2222-4222-8222-222222222222';

const MATCH_SUGGESTION: PublicationMatchSuggestion = {
  id: MATCH_ID,
  status: 'SUGGESTED',
  candidate: {
    id: CANDIDATE_ID,
    type: 'FOUND',
    status: 'ACTIVE',
    title: 'Mochila gris hallada en el club',
    description: 'Mochila gris con toalla azul, encontrada en el vestuario.',
    category: 'BAGS',
    location: 'Vestuario del club',
    eventDate: '2024-05-11',
    createdAt: '2026-11-05T12:00:00.000Z',
  },
  score: 0.87,
  scoreBreakdown: {
    text: { score: 0.8, weight: 0.5, contribution: 0.4 },
    category: { score: 1, weight: 0.2, contribution: 0.2 },
    date: { score: 1, weight: 0.15, contribution: 0.15 },
    location: { score: 0.8, weight: 0.15, contribution: 0.12 },
  },
  eventDateDifferenceDays: 0,
};

function matchesResponse(
  items: PublicationMatchSuggestion[],
): PublicationMatchesResponse {
  return { publicationId: PUBLICATION_ID, items };
}

const routes: Routes = [
  { path: 'publications/:id', component: PublicationDetailPageComponent },
];

describe('PublicationDetailPageComponent', () => {
  let harness: RouterTestingHarness;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    harness = await RouterTestingHarness.create();
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function render(
    id: string = PUBLICATION_ID,
    query = '',
  ): Promise<PublicationDetailPageComponent> {
    await harness.navigateByUrl(`/publications/${id}${query}`);
    const component = harness.routeDebugElement?.componentInstance;

    expect(component).toBeInstanceOf(PublicationDetailPageComponent);
    return component as PublicationDetailPageComponent;
  }

  function panel(testId: string): HTMLElement | null {
    return harness.fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
  }

  it('renders the publication detail with every public field', async () => {
    await render();

    expect(panel('loading')).not.toBeNull();

    const request = httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`);

    expect(request.request.method).toBe('GET');
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );

    request.flush(PUBLICATION);
    harness.fixture.detectChanges();

    expect(panel('matches-loading')).not.toBeNull();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    harness.fixture.detectChanges();

    const detail = panel('detail');

    expect(detail).not.toBeNull();
    expect(detail?.textContent).toContain(PUBLICATION.title);
    expect(detail?.textContent).toContain(PUBLICATION.description);
    expect(detail?.textContent).toContain(PUBLICATION.location);
    expect(detail?.textContent).toContain('Bolsos y mochilas');
    expect(detail?.textContent).toContain('Perdido');
    expect(detail?.textContent).toContain('Activa');
    expect(detail?.textContent).not.toContain('ACTIVE');
    expect(detail?.textContent).toContain('Información del objeto');
    expect(detail?.textContent).toContain('Metadatos de publicación');
    expect(
      detail?.querySelector('time[datetime="2024-05-10"]')?.textContent?.trim(),
    ).toBe('10/05/2024');
    expect(
      detail?.querySelector(
        'time[datetime="2026-11-05T10:00:00.000Z"]',
      )?.textContent?.trim(),
    ).toBe('05/11/2026 10:00 UTC');
    expect(
      detail?.querySelector(
        'time[datetime="2026-11-06T09:30:00.000Z"]',
      )?.textContent?.trim(),
    ).toBe('06/11/2026 09:30 UTC');
    expect(detail?.textContent).toContain(PUBLICATION.id);
    expect(detail?.textContent).not.toContain('ownerId');
    expect(detail?.textContent).not.toContain('contact');

    const backLink = panel('back-link') as HTMLAnchorElement | null;

    expect(backLink?.getAttribute('href')).toBe('/publications');
    expect(panel('loading')).toBeNull();
    expect(panel('matches-empty')?.textContent).toContain(
      'Todavía no encontramos coincidencias',
    );
  });

  it('renders suggested matches with explanations and a link to the candidate', async () => {
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(PUBLICATION);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([MATCH_SUGGESTION]));
    harness.fixture.detectChanges();

    const card = panel(`match-${MATCH_ID}`) as HTMLElement | null;

    expect(panel('matches-list')).not.toBeNull();
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain(MATCH_SUGGESTION.candidate.title);
    expect(card?.textContent).toContain('Encontrado');
    expect(card?.textContent).toContain('87% de coincidencia');
    expect(card?.textContent).toContain('Texto: 80%');
    expect(card?.textContent).toContain('Categoría: coincide');
    expect(card?.textContent).toContain('0 días de diferencia');
    expect(card?.textContent).toContain('Ubicación: 80%');
    expect(
      card?.querySelector('time[datetime="2024-05-11"]')?.textContent,
    ).toContain('11/05/2024');

    const candidateLink = card?.querySelector(
      'a.candidate-detail-link',
    ) as HTMLAnchorElement | null;

    expect(candidateLink?.getAttribute('href')).toBe(
      `/publications/${CANDIDATE_ID}`,
    );
    const recoveryLink = card?.querySelector(
      '[data-testid="solicitar-recuperacion-sugerencia"]',
    ) as HTMLAnchorElement | null;
    expect(recoveryLink?.getAttribute('href')).toBe(
      `/publications/${CANDIDATE_ID}#solicitar-recuperacion`,
    );
    expect(card?.textContent).not.toContain('ownerId');
    expect(panel('matches-section')?.textContent).toContain(
      'no confirman que sea la misma',
    );
  });

  it('keeps the detail visible when matches fail and retries the section', async () => {
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(PUBLICATION);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(
        { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
        { status: 500, statusText: 'Internal Server Error' },
      );
    harness.fixture.detectChanges();

    expect(panel('detail')).not.toBeNull();
    expect(panel('matches-error')?.textContent).toContain(
      'No se pudieron cargar las coincidencias',
    );

    (panel('matches-retry-button') as HTMLButtonElement | null)?.click();
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    harness.fixture.detectChanges();

    expect(panel('matches-error')).toBeNull();
    expect(panel('matches-empty')).not.toBeNull();
    expect(panel('detail')).not.toBeNull();
  });

  it('returns to the listing with only the allowlisted search context', async () => {
    await render(
      PUBLICATION_ID,
      '?q=llaves&type=FOUND&category=KEYS&eventDateFrom=2024-01-01&eventDateTo=2024-05-01&sort=oldest&page=3&returnUrl=https%3A%2F%2Fevil.example',
    );

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(PUBLICATION);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    harness.fixture.detectChanges();

    const backLink = panel('back-link') as HTMLAnchorElement | null;
    const url = new URL(backLink?.getAttribute('href') ?? '', 'http://localhost');

    expect(url.pathname).toBe('/publications');
    expect(url.searchParams.get('q')).toBe('llaves');
    expect(url.searchParams.get('type')).toBe('FOUND');
    expect(url.searchParams.get('category')).toBe('KEYS');
    expect(url.searchParams.get('eventDateFrom')).toBe('2024-01-01');
    expect(url.searchParams.get('eventDateTo')).toBe('2024-05-01');
    expect(url.searchParams.get('sort')).toBe('oldest');
    expect(url.searchParams.get('page')).toBe('3');
    expect(url.searchParams.has('returnUrl')).toBe(false);
  });

  it('shows the recovery request panel for an active FOUND publication', async () => {
    const found: PublicationDetail = {
      ...PUBLICATION,
      type: 'FOUND',
      title: 'Mochila negra encontrada',
    };
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(found);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    httpMock
      .expectOne(
        `${environment.apiBaseUrl}/v1/recovery-requests/mine`,
      )
      .flush([]);
    harness.fixture.detectChanges();

    expect(panel('request-section')).not.toBeNull();
    expect(panel('request-submit')).not.toBeNull();
    expect(panel('request-section')?.textContent).toContain(
      'Solicitar recuperación',
    );
  });

  it('does not show the recovery request panel for a LOST publication', async () => {
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(PUBLICATION);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    harness.fixture.detectChanges();

    expect(panel('request-section')).toBeNull();
  });

  it('shows a not found state for PUBLICATION_NOT_FOUND', async () => {
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(
      {
        statusCode: 404,
        code: 'PUBLICATION_NOT_FOUND',
        message: 'Publication not found',
      },
      { status: 404, statusText: 'Not Found' },
    );
    harness.fixture.detectChanges();

    expect(panel('not-found')).not.toBeNull();
    expect(panel('not-found')?.textContent).toContain('no encontrada');
    expect(panel('detail')).toBeNull();
    expect(panel('back-link')?.getAttribute('href')).toBe('/publications');
  });

  it('shows a connection error and allows retrying', async () => {
    const component = await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(
      new ErrorEvent('NetworkError'),
      { status: 0, statusText: 'Unknown Error' },
    );
    harness.fixture.detectChanges();

    expect(panel('error-panel')?.textContent).toContain('conectar');
    expect(panel('detail')).toBeNull();

    component.retry();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(PUBLICATION);
    harness.fixture.detectChanges();

    httpMock
      .expectOne(`${ENDPOINT}/${PUBLICATION_ID}/matches`)
      .flush(matchesResponse([]));
    harness.fixture.detectChanges();

    expect(panel('detail')).not.toBeNull();
    expect(panel('error-panel')).toBeNull();
  });

  it('shows a generic error for unexpected responses', async () => {
    await render();

    httpMock.expectOne(`${ENDPOINT}/${PUBLICATION_ID}`).flush(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    harness.fixture.detectChanges();

    expect(panel('error-panel')?.textContent).toContain(
      'No se pudo cargar la publicación',
    );
    expect(panel('detail')).toBeNull();
  });
});
