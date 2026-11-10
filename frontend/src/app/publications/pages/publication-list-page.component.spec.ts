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
  Router,
  type Routes,
} from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import type {
  PublicationSearchResponse,
  PublicationSummary,
} from '../models/publication-search.models';
import { PublicationDetailPageComponent } from './publication-detail-page.component';
import { PublicationListPageComponent } from './publication-list-page.component';

const ENDPOINT = `${environment.apiBaseUrl}/v1/publications`;
const LOST_ID = '11111111-1111-4111-8111-111111111111';
const FOUND_ID = '22222222-2222-4222-8222-222222222222';

const LOST_PUBLICATION: PublicationSummary = {
  id: LOST_ID,
  type: 'LOST',
  status: 'ACTIVE',
  title: 'Mochila gris de gimnasio',
  description: 'Mochila gris con toalla azul y un candado pequeño.',
  category: 'BAGS',
  location: 'Vestuario del club',
  eventDate: '2024-05-10',
  createdAt: '2026-11-05T10:00:00.000Z',
};

const FOUND_PUBLICATION: PublicationSummary = {
  id: FOUND_ID,
  type: 'FOUND',
  status: 'ACTIVE',
  title: 'Llaves con llavero rojo',
  description: 'Llaves encontradas junto a la fuente de la plaza.',
  category: 'KEYS',
  location: 'Plaza central',
  eventDate: '2024-05-11',
  createdAt: '2026-11-05T11:00:00.000Z',
};

const routes: Routes = [
  { path: 'publications', component: PublicationListPageComponent },
  { path: 'publications/:id', component: PublicationDetailPageComponent },
];

function searchResponse(
  items: PublicationSummary[],
  overrides: Partial<PublicationSearchResponse> = {},
): PublicationSearchResponse {
  return {
    items,
    page: 1,
    pageSize: 12,
    total: items.length,
    totalPages: items.length ? 1 : 0,
    ...overrides,
  };
}

describe('PublicationListPageComponent', () => {
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
  });

  afterEach(() => {
    httpMock.verify();
  });

  async function render(url: string): Promise<PublicationListPageComponent> {
    await harness.navigateByUrl(url);
    const component = harness.routeDebugElement?.componentInstance;

    expect(component).toBeInstanceOf(PublicationListPageComponent);
    return component as PublicationListPageComponent;
  }

  function expectSearch() {
    return httpMock.expectOne(
      (request) => request.url === ENDPOINT && request.method === 'GET',
    );
  }

  function panel(testId: string): HTMLElement | null {
    return harness.fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    );
  }

  it('renders an accessible search form and shows loading while fetching', async () => {
    await render('/publications');

    const input = harness.fixture.nativeElement.querySelector(
      '#publication-search',
    ) as HTMLInputElement | null;
    const label = harness.fixture.nativeElement.querySelector(
      'label[for="publication-search"]',
    ) as HTMLLabelElement | null;

    expect(label?.textContent?.trim()).toBe('Buscar publicaciones');
    expect(input).not.toBeNull();
    expect(panel('loading')).not.toBeNull();
    expect(panel('search-button')).not.toBeNull();
    expect(panel('clear-button')).not.toBeNull();

    expectSearch().flush(searchResponse([]));
    harness.fixture.detectChanges();

    expect(panel('loading')).toBeNull();
  });

  it('lists LOST and FOUND results with their data and detail links', async () => {
    await render('/publications?q=mochila');

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('mochila');
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('12');

    request.flush(searchResponse([LOST_PUBLICATION, FOUND_PUBLICATION], {
      total: 2,
      totalPages: 1,
    }));
    harness.fixture.detectChanges();

    const results = panel('results');

    expect(results).not.toBeNull();
    expect(results?.textContent).toContain('Mochila gris de gimnasio');
    expect(results?.textContent).toContain('Llaves con llavero rojo');
    expect(results?.textContent).toContain('Perdido');
    expect(results?.textContent).toContain('Encontrado');
    expect(results?.textContent).toContain('Bolsos y mochilas');
    expect(results?.textContent).toContain('Llaves');
    expect(results?.textContent).toContain('Vestuario del club');
    expect(results?.textContent).toContain('Plaza central');
    expect(results?.textContent).toContain('2024-05-10');
    expect(panel('results-count')?.textContent).toContain(
      '2 publicaciones encontradas',
    );
    expect(panel('loading')).toBeNull();

    const lostLink = harness.fixture.nativeElement.querySelector(
      `[data-testid="detail-link-${LOST_ID}"]`,
    ) as HTMLAnchorElement | null;

    expect(lostLink?.getAttribute('href')).toBe(
      `/publications/${LOST_ID}?q=mochila`,
    );
  });

  it('preserves all search and filter criteria when opening a detail', async () => {
    await render(
      '/publications?q=mochila&type=LOST&category=BAGS&eventDateFrom=2024-01-01&eventDateTo=2024-05-01&sort=oldest&page=2',
    );

    expectSearch().flush(searchResponse([LOST_PUBLICATION]));
    harness.fixture.detectChanges();

    const link = harness.fixture.nativeElement.querySelector(
      `[data-testid="detail-link-${LOST_ID}"]`,
    ) as HTMLAnchorElement | null;
    const url = new URL(link?.getAttribute('href') ?? '', 'http://localhost');

    expect(url.pathname).toBe(`/publications/${LOST_ID}`);
    expect(url.searchParams.get('q')).toBe('mochila');
    expect(url.searchParams.get('type')).toBe('LOST');
    expect(url.searchParams.get('category')).toBe('BAGS');
    expect(url.searchParams.get('eventDateFrom')).toBe('2024-01-01');
    expect(url.searchParams.get('eventDateTo')).toBe('2024-05-01');
    expect(url.searchParams.get('sort')).toBe('oldest');
    expect(url.searchParams.get('page')).toBe('2');
  });

  it('reads q and page from the URL and searches those values', async () => {
    const component = await render('/publications?q=llaves&page=2');

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('llaves');
    expect(request.request.params.get('page')).toBe('2');
    expect(component.query()).toBe('llaves');
    expect(component.page()).toBe(2);

    const input = harness.fixture.nativeElement.querySelector(
      '#publication-search',
    ) as HTMLInputElement;

    expect(input.value).toBe('llaves');

    request.flush(
      searchResponse([FOUND_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    expect(panel('page-indicator')?.textContent).toContain('Página 2 de 2');
  });

  it('normalizes invalid page values to page 1', async () => {
    await render('/publications?page=abc');

    const request = expectSearch();

    expect(request.request.params.get('page')).toBe('1');

    request.flush(searchResponse([]));
  });

  it('shows the empty state when there are no results', async () => {
    await render('/publications?q=inexistente');

    expectSearch().flush(searchResponse([]));
    harness.fixture.detectChanges();

    expect(panel('empty')).not.toBeNull();
    expect(panel('empty')?.textContent).toContain('inexistente');
    expect(panel('results')).toBeNull();
    expect(panel('pagination')).toBeNull();
  });

  it('shows an error panel when the request fails', async () => {
    await render('/publications');

    expectSearch().flush(
      { statusCode: 500, code: 'INTERNAL_ERROR', message: 'error' },
      { status: 500, statusText: 'Internal Server Error' },
    );
    harness.fixture.detectChanges();

    expect(panel('error-panel')).not.toBeNull();
    expect(panel('error-panel')?.textContent).toContain('cargar');
    expect(panel('results')).toBeNull();
  });

  it('shows a connection message when the API is unreachable', async () => {
    await render('/publications');

    expectSearch().flush(new ErrorEvent('NetworkError'), {
      status: 0,
      statusText: 'Unknown Error',
    });
    harness.fixture.detectChanges();

    expect(panel('error-panel')?.textContent).toContain('conectar');
  });

  it('navigates with the search term and page 1 when submitting', async () => {
    const component = await render('/publications');

    expectSearch().flush(searchResponse([]));

    const input = harness.fixture.nativeElement.querySelector(
      '#publication-search',
    ) as HTMLInputElement;

    input.value = '  llaves  ';
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();

    expect(component.searchControl.value).toBe('  llaves  ');

    await component.submit();

    expect(TestBed.inject(Router).url).toContain('q=llaves');
    expect(TestBed.inject(Router).url).toContain('page=1');

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('llaves');
    expect(request.request.params.get('page')).toBe('1');

    request.flush(searchResponse([FOUND_PUBLICATION]));
    harness.fixture.detectChanges();

    expect(panel('results')).not.toBeNull();
  });

  it('prevents the native form submission and navigates with the term', async () => {
    await render('/publications');

    expectSearch().flush(searchResponse([]));

    const input = harness.fixture.nativeElement.querySelector(
      '#publication-search',
    ) as HTMLInputElement;
    const form = harness.fixture.nativeElement.querySelector(
      'form',
    ) as HTMLFormElement;

    input.value = 'llaves';
    input.dispatchEvent(new Event('input'));
    harness.fixture.detectChanges();

    const submitEvent = new Event('submit', {
      cancelable: true,
      bubbles: true,
    });

    form.dispatchEvent(submitEvent);
    await harness.fixture.whenStable();

    expect(submitEvent.defaultPrevented).toBe(true);
    expect(TestBed.inject(Router).url).toContain('q=llaves');

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('llaves');
    request.flush(searchResponse([FOUND_PUBLICATION]));
    harness.fixture.detectChanges();

    expect(panel('results')).not.toBeNull();
  });

  it('clears the search term without sending q', async () => {
    const component = await render('/publications?q=mochila&page=2');

    expectSearch().flush(
      searchResponse([LOST_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );

    await component.clear();

    expect(TestBed.inject(Router).url).not.toContain('q=');

    const request = expectSearch();

    expect(request.request.params.has('q')).toBe(false);
    expect(request.request.params.get('page')).toBe('1');

    request.flush(searchResponse([]));
  });

  it('paginates forward and backward keeping the search term', async () => {
    const component = await render('/publications?q=mochila&page=1');

    expectSearch().flush(
      searchResponse([LOST_PUBLICATION], {
        page: 1,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    const previous = panel('previous-page') as HTMLButtonElement;
    const next = panel('next-page') as HTMLButtonElement;

    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);

    await component.nextPage();

    expect(TestBed.inject(Router).url).toContain('page=2');
    expect(TestBed.inject(Router).url).toContain('q=mochila');

    const secondPage = expectSearch();

    expect(secondPage.request.params.get('q')).toBe('mochila');
    expect(secondPage.request.params.get('page')).toBe('2');

    secondPage.flush(
      searchResponse([FOUND_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    expect(panel('page-indicator')?.textContent).toContain('Página 2 de 2');
    expect(
      (panel('previous-page') as HTMLButtonElement).disabled,
    ).toBe(false);
    expect((panel('next-page') as HTMLButtonElement).disabled).toBe(true);

    await component.previousPage();

    const firstPage = expectSearch();

    expect(firstPage.request.params.get('page')).toBe('1');
    expect(firstPage.request.params.get('q')).toBe('mochila');

    firstPage.flush(
      searchResponse([LOST_PUBLICATION], {
        page: 1,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    expect(panel('page-indicator')?.textContent).toContain('Página 1 de 2');
  });

  it('shows the empty state for a page beyond the last one', async () => {
    const component = await render('/publications?q=mochila&page=5');

    expectSearch().flush(
      searchResponse([], {
        page: 5,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    expect(component.page()).toBe(5);
    expect(panel('empty')).not.toBeNull();
    expect(panel('page-indicator')?.textContent).toContain('Página 5 de 2');
    expect((panel('next-page') as HTMLButtonElement).disabled).toBe(true);
  });

  it('reads filters and sort from the URL and sends them', async () => {
    const component = await render(
      '/publications?q=bici&type=LOST&category=SPORTS&eventDateFrom=2024-01-01&eventDateTo=2024-12-31&sort=oldest',
    );

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('bici');
    expect(request.request.params.get('type')).toBe('LOST');
    expect(request.request.params.get('category')).toBe('SPORTS');
    expect(request.request.params.get('eventDateFrom')).toBe('2024-01-01');
    expect(request.request.params.get('eventDateTo')).toBe('2024-12-31');
    expect(request.request.params.get('sort')).toBe('oldest');
    expect(component.typeControl.value).toBe('LOST');
    expect(component.categoryControl.value).toBe('SPORTS');
    expect(component.eventDateFromControl.value).toBe('2024-01-01');
    expect(component.eventDateToControl.value).toBe('2024-12-31');
    expect(component.sortControl.value).toBe('oldest');

    request.flush(searchResponse([LOST_PUBLICATION]));
  });

  it('applies filters and sort with an explicit submit and resets to page 1', async () => {
    const component = await render('/publications?q=mochila&page=2');

    expectSearch().flush(
      searchResponse([LOST_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );

    component.typeControl.setValue('FOUND');
    component.categoryControl.setValue('KEYS');
    component.eventDateFromControl.setValue('2024-01-01');
    component.eventDateToControl.setValue('2024-12-31');
    component.sortControl.setValue('oldest');

    await component.submit();

    const url = TestBed.inject(Router).url;

    expect(url).toContain('page=1');
    expect(url).toContain('q=mochila');
    expect(url).toContain('type=FOUND');
    expect(url).toContain('category=KEYS');
    expect(url).toContain('eventDateFrom=2024-01-01');
    expect(url).toContain('eventDateTo=2024-12-31');
    expect(url).toContain('sort=oldest');

    const request = expectSearch();

    expect(request.request.params.get('q')).toBe('mochila');
    expect(request.request.params.get('type')).toBe('FOUND');
    expect(request.request.params.get('category')).toBe('KEYS');
    expect(request.request.params.get('eventDateFrom')).toBe('2024-01-01');
    expect(request.request.params.get('eventDateTo')).toBe('2024-12-31');
    expect(request.request.params.get('sort')).toBe('oldest');
    expect(request.request.params.get('page')).toBe('1');

    request.flush(searchResponse([FOUND_PUBLICATION]));
  });

  it('preserves filters and sort while paginating', async () => {
    const component = await render(
      '/publications?type=LOST&category=SPORTS&eventDateFrom=2024-01-01&sort=oldest&page=1',
    );

    expectSearch().flush(
      searchResponse([LOST_PUBLICATION], {
        page: 1,
        total: 13,
        totalPages: 2,
      }),
    );
    harness.fixture.detectChanges();

    await component.nextPage();

    expect(TestBed.inject(Router).url).toContain('page=2');

    const request = expectSearch();

    expect(request.request.params.get('type')).toBe('LOST');
    expect(request.request.params.get('category')).toBe('SPORTS');
    expect(request.request.params.get('eventDateFrom')).toBe('2024-01-01');
    expect(request.request.params.get('sort')).toBe('oldest');
    expect(request.request.params.get('page')).toBe('2');

    request.flush(
      searchResponse([LOST_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );
  });

  it('clears every filter, the sort and the URL criteria', async () => {
    const component = await render(
      '/publications?q=mochila&type=LOST&category=SPORTS&eventDateFrom=2024-01-01&eventDateTo=2024-12-31&sort=oldest&page=2',
    );

    expectSearch().flush(
      searchResponse([LOST_PUBLICATION], {
        page: 2,
        total: 13,
        totalPages: 2,
      }),
    );

    await component.clear();

    const url = TestBed.inject(Router).url;

    expect(url).not.toContain('q=');
    expect(url).not.toContain('type=');
    expect(url).not.toContain('category=');
    expect(url).not.toContain('eventDateFrom=');
    expect(url).not.toContain('eventDateTo=');
    expect(url).not.toContain('sort=');

    const request = expectSearch();

    for (const name of [
      'q',
      'type',
      'category',
      'eventDateFrom',
      'eventDateTo',
      'sort',
    ]) {
      expect(request.request.params.has(name)).toBe(false);
    }

    expect(request.request.params.get('page')).toBe('1');
    expect(component.typeControl.value).toBe('');
    expect(component.categoryControl.value).toBe('');
    expect(component.sortControl.value).toBe('recent');

    request.flush(searchResponse([]));
  });

  it('disables relevance while the search term is empty', async () => {
    const component = await render('/publications');

    expectSearch().flush(searchResponse([]));
    harness.fixture.detectChanges();

    const select = panel('sort-select') as HTMLSelectElement;
    const relevance = Array.from(select.options).find(
      (option) => option.value === 'relevance',
    );

    expect(relevance?.disabled).toBe(true);

    component.searchControl.setValue('llaves');
    harness.fixture.detectChanges();

    expect(relevance?.disabled).toBe(false);
  });

  it('normalizes sort=relevance to recent when there is no search term', async () => {
    const component = await render('/publications?sort=relevance');

    const request = expectSearch();

    expect(request.request.params.has('sort')).toBe(false);
    expect(component.sortControl.value).toBe('recent');

    request.flush(searchResponse([]));
  });

  it('rejects an inverted date range before navigating', async () => {
    const component = await render('/publications');

    expectSearch().flush(searchResponse([]));
    harness.fixture.detectChanges();

    component.eventDateFromControl.setValue('2024-12-31');
    component.eventDateToControl.setValue('2024-01-01');

    await component.submit();
    harness.fixture.detectChanges();

    expect(panel('form-error')?.textContent).toContain('no puede ser posterior');
    expect(TestBed.inject(Router).url).not.toContain('eventDateFrom=');
  });

  it('shows a filter-specific empty state', async () => {
    await render('/publications?type=LOST&category=SPORTS');

    expectSearch().flush(searchResponse([]));
    harness.fixture.detectChanges();

    expect(panel('empty')?.textContent).toContain('filtros seleccionados');
  });
});
