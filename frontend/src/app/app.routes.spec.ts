import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { App } from './app';
import { routes } from './app.routes';
import { demoIdentityInterceptor } from './core/demo-identity.interceptor';
import {
  DEMO_USER_A_ID,
  DemoSessionService,
} from './core/demo-session.service';
import { IdentityService } from './core/identity.service';
import type { UserRole } from './core/identity.models';
import { environment } from '../environments/environment';

const PUBLICATIONS_ENDPOINT = `${environment.apiBaseUrl}/v1/publications`;
const ADMIN_PUBLICATIONS_ENDPOINT = `${environment.apiBaseUrl}/v1/admin/publications`;
const RECOVERY_ENDPOINT = `${environment.apiBaseUrl}/v1/recovery-requests`;
const ME_ENDPOINT = `${environment.apiBaseUrl}/v1/me`;
const DETAIL_ID = '33333333-3333-4333-8333-333333333333';

const EMPTY_SEARCH_RESPONSE = {
  items: [],
  page: 1,
  pageSize: 12,
  total: 0,
  totalPages: 0,
};

const EMPTY_MATCHES_RESPONSE = {
  publicationId: DETAIL_ID,
  items: [],
};

const PUBLICATION_DETAIL_RESPONSE = {
  id: DETAIL_ID,
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

describe('app routes', () => {
  let router: Router;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(IdentityService).reset();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  async function renderShell(
    url: string,
    role: UserRole = 'USER',
    authenticated = true,
  ) {
    const session = TestBed.inject(DemoSessionService);
    session.clear();
    if (authenticated) {
      session.select(DEMO_USER_A_ID);
    }

    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const navigation = router.navigateByUrl(url);
    fixture.detectChanges();
    flushPendingIdentityRequest(role);
    await navigation;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    flushPendingPublicationRequest(url);
    flushPendingAdminPublicationsRequest();
    flushPendingRecoveryRequest();

    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function flushPendingAdminPublicationsRequest(): void {
    const requests = httpMock.match(ADMIN_PUBLICATIONS_ENDPOINT);

    for (const request of requests) {
      request.flush([]);
    }
  }

  function flushPendingIdentityRequest(role: UserRole): void {
    const requests = httpMock.match(ME_ENDPOINT);

    for (const request of requests) {
      request.flush({ role });
    }
  }

  function flushPendingRecoveryRequest(): void {
    let requests = httpMock.match((request) =>
      request.url.startsWith(RECOVERY_ENDPOINT),
    );

    while (requests.length > 0) {
      for (const request of requests) {
        request.flush([]);
      }

      requests = httpMock.match((request) =>
        request.url.startsWith(RECOVERY_ENDPOINT),
      );
    }
  }

  function flushPendingPublicationRequest(url: string): void {
    let requests = httpMock.match((request) =>
      request.url.startsWith(PUBLICATIONS_ENDPOINT),
    );

    while (requests.length > 0) {
      for (const request of requests) {
        if (request.request.url === `${PUBLICATIONS_ENDPOINT}/mine`) {
          request.flush([]);
        } else if (
          request.request.url.startsWith(`${PUBLICATIONS_ENDPOINT}/mine/`)
        ) {
          request.flush(PUBLICATION_DETAIL_RESPONSE);
        } else if (request.request.url.endsWith('/matches')) {
          request.flush(EMPTY_MATCHES_RESPONSE);
        } else if (url.startsWith('/publications/')) {
          request.flush(PUBLICATION_DETAIL_RESPONSE);
        } else {
          request.flush(EMPTY_SEARCH_RESPONSE);
        }
      }

      requests = httpMock.match((request) =>
        request.url.startsWith(PUBLICATIONS_ENDPOINT),
      );
    }
  }

  it('renders the access screen at / when there is no active identity', async () => {
    const fixture = await renderShell('/', 'USER', false);

    expect(router.url).toBe('/');
    expect(
      fixture.nativeElement.querySelector('app-access-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="access-register"]',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('[data-testid="access-login"]'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-create-lost-publication-page'),
    ).toBeNull();
  });

  it('renders the simulated registration screen at /register', async () => {
    const fixture = await renderShell('/register', 'USER', false);

    expect(router.url).toBe('/register');
    expect(
      fixture.nativeElement.querySelector('app-register-page'),
    ).not.toBeNull();
  });

  it('renders the demo login screen at /login', async () => {
    const fixture = await renderShell('/login', 'USER', false);

    expect(router.url).toBe('/login');
    expect(
      fixture.nativeElement.querySelector('app-login-page'),
    ).not.toBeNull();
  });

  it('renders the lost publication form at /lost', async () => {
    const fixture = await renderShell('/lost');

    expect(router.url).toBe('/lost');
    expect(
      fixture.nativeElement.querySelector('app-create-lost-publication-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-create-found-publication-page'),
    ).toBeNull();
  });

  it('redirects a private route to / when there is no identity', async () => {
    const fixture = await renderShell('/publications', 'USER', false);

    expect(router.url).toBe('/');
    expect(
      fixture.nativeElement.querySelector('app-access-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-publication-list-page'),
    ).toBeNull();
  });

  it('renders the found publication form at /found', async () => {
    const fixture = await renderShell('/found');

    expect(router.url).toBe('/found');
    expect(
      fixture.nativeElement.querySelector('app-create-found-publication-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-create-lost-publication-page'),
    ).toBeNull();
  });

  it('renders the assistant at /assistant', async () => {
    const fixture = await renderShell('/assistant');

    expect(router.url).toBe('/assistant');
    expect(
      fixture.nativeElement.querySelector('app-assistant-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-publication-list-page'),
    ).toBeNull();
  });

  it('renders the publication list at /publications', async () => {
    const fixture = await renderShell('/publications');

    expect(router.url).toBe('/publications');
    expect(
      fixture.nativeElement.querySelector('app-publication-list-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-publication-detail-page'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-create-lost-publication-page'),
    ).toBeNull();
  });

  it('renders the publication detail at /publications/:id', async () => {
    const fixture = await renderShell(`/publications/${DETAIL_ID}`);

    expect(router.url).toBe(`/publications/${DETAIL_ID}`);
    expect(
      fixture.nativeElement.querySelector('app-publication-detail-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-publication-list-page'),
    ).toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-create-lost-publication-page'),
    ).toBeNull();
  });

  it('renders my recovery requests at /recovery-requests', async () => {
    const fixture = await renderShell('/recovery-requests');

    expect(router.url).toBe('/recovery-requests');
    expect(
      fixture.nativeElement.querySelector(
        'app-my-recovery-requests-page',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'app-received-recovery-requests-page',
      ),
    ).toBeNull();
  });

  it('renders received recovery requests at /recovery-requests/received', async () => {
    const fixture = await renderShell('/recovery-requests/received');

    expect(router.url).toBe('/recovery-requests/received');
    expect(
      fixture.nativeElement.querySelector(
        'app-received-recovery-requests-page',
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        'app-my-recovery-requests-page',
      ),
    ).toBeNull();
  });

  it('renders my publications for USER and ADMIN', async () => {
    const user = await renderShell('/my-publications');

    expect(router.url).toBe('/my-publications');
    expect(
      user.nativeElement.querySelector('app-my-publications-page'),
    ).not.toBeNull();

    const admin = await renderShell('/my-publications', 'ADMIN');
    expect(
      admin.nativeElement.querySelector('app-my-publications-page'),
    ).not.toBeNull();
  });

  it('renders own publication detail and edit routes', async () => {
    const detail = await renderShell(`/my-publications/${DETAIL_ID}`);

    expect(router.url).toBe(`/my-publications/${DETAIL_ID}`);
    expect(
      detail.nativeElement.querySelector('app-my-publication-detail-page'),
    ).not.toBeNull();

    const edit = await renderShell(`/my-publications/${DETAIL_ID}/edit`);
    expect(router.url).toBe(`/my-publications/${DETAIL_ID}/edit`);
    expect(
      edit.nativeElement.querySelector('app-edit-publication-page'),
    ).not.toBeNull();
  });

  it('allows ADMIN into the moderation route', async () => {
    const admin = await renderShell('/admin/publications', 'ADMIN');

    expect(router.url).toBe('/admin/publications');
    expect(
      admin.nativeElement.querySelector('app-admin-publications-page'),
    ).not.toBeNull();
  });

  it('redirects USER away from the moderation route', async () => {
    const user = await renderShell('/admin/publications', 'USER');

    expect(router.url).toBe('/publications');
    expect(
      user.nativeElement.querySelector('app-admin-publications-page'),
    ).toBeNull();
    expect(
      user.nativeElement.querySelector('app-publication-list-page'),
    ).not.toBeNull();
  });

  it('redirects an authenticated user from / to /publications', async () => {
    const fixture = await renderShell('/');

    expect(router.url).toBe('/publications');
    expect(
      fixture.nativeElement.querySelector('app-publication-list-page'),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('app-access-page'),
    ).toBeNull();
  });

  it('clears the active identity on logout and returns to /', async () => {
    const fixture = await renderShell('/publications');
    const session = TestBed.inject(DemoSessionService);

    expect(session.isAuthenticated()).toBe(true);
    expect(
      fixture.nativeElement.querySelector('[data-testid="active-demo-profile"]')
        ?.textContent,
    ).toContain('Usuario demo A');

    (
      fixture.nativeElement.querySelector(
        '[data-testid="logout-button"]',
      ) as HTMLButtonElement
    ).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(router.url).toBe('/');
    expect(session.isAuthenticated()).toBe(false);
    expect(
      fixture.nativeElement.querySelector('app-access-page'),
    ).not.toBeNull();
    expect(localStorage.getItem('lostfound.demo-session.v1')).toBeNull();
  });

  it('shows the active demo profile and logout control', async () => {
    const fixture = await renderShell('/publications');

    expect(
      fixture.nativeElement.querySelector('[data-testid="active-demo-profile"]')
        ?.textContent,
    ).toContain('Usuario demo A');
    expect(
      fixture.nativeElement.querySelector('[data-testid="logout-button"]'),
    ).not.toBeNull();
  });


  it('redirects unknown routes to / when there is no identity', async () => {
    const fixture = await renderShell('/ruta-inexistente', 'USER', false);

    expect(router.url).toBe('/');
    expect(
      fixture.nativeElement.querySelector('app-access-page'),
    ).not.toBeNull();
  });

  it('renders the shell navigation with the seven USER links', async () => {
    const fixture = await renderShell('/found');
    const links = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(links.length).toBe(7);
    expect(links[0].textContent?.trim()).toBe('Perdí un objeto');
    expect(links[1].textContent?.trim()).toBe('Encontré un objeto');
    expect(links[2].textContent?.trim()).toBe('Buscar');
    expect(links[3].textContent?.trim()).toBe('Asistente');
    expect(links[4].textContent?.trim()).toBe('Mis solicitudes');
    expect(links[5].textContent?.trim()).toBe('Recibidas');
    expect(links[6].textContent?.trim()).toBe('Mis publicaciones');
    expect(links[0].getAttribute('href')).toBe('/lost');
    expect(links[1].getAttribute('href')).toBe('/found');
    expect(links[2].getAttribute('href')).toBe('/publications');
    expect(links[3].getAttribute('href')).toBe('/assistant');
    expect(links[4].getAttribute('href')).toBe('/recovery-requests');
    expect(links[5].getAttribute('href')).toBe('/recovery-requests/received');
    expect(links[6].getAttribute('href')).toBe('/my-publications');
    expect(links[1].classList).toContain('active');
    expect(links[0].classList).not.toContain('active');
    expect(links[2].classList).not.toContain('active');
    expect(links[3].classList).not.toContain('active');
    expect(links[4].classList).not.toContain('active');
    expect(links[5].classList).not.toContain('active');
    expect(links[6].classList).not.toContain('active');
    expect(
      fixture.nativeElement.querySelector('[data-testid="moderation-link"]'),
    ).toBeNull();
  });

  it('shows the moderation link only to ADMIN', async () => {
    const fixture = await renderShell('/found', 'ADMIN');
    const links = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(links.length).toBe(8);
    expect(links[7].textContent?.trim()).toBe('Moderación');
    expect(links[7].getAttribute('href')).toBe('/admin/publications');
    expect(
      fixture.nativeElement.querySelector('[data-testid="moderation-link"]'),
    ).not.toBeNull();
  });

  it('marks the recovery navigation links as active', async () => {
    const mine = await renderShell('/recovery-requests');
    const mineLinks = Array.from(
      mine.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(mineLinks[4].classList).toContain('active');
    expect(mineLinks[5].classList).not.toContain('active');

    const received = await renderShell('/recovery-requests/received');
    const receivedLinks = Array.from(
      received.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(receivedLinks[5].classList).toContain('active');
    expect(receivedLinks[4].classList).not.toContain('active');
  });

  it('marks the Buscar link as active on the publication routes', async () => {
    const fixture = await renderShell('/publications');
    const links = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(links[2].classList).toContain('active');

    await router.navigateByUrl(`/publications/${DETAIL_ID}`);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    flushPendingPublicationRequest(`/publications/${DETAIL_ID}`);
    fixture.detectChanges();

    const detailLinks = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.app-nav a',
      ) as NodeListOf<HTMLAnchorElement>,
    );

    expect(detailLinks[2].classList).toContain('active');
  });

  it('keeps the selected appearance while navigating between routes', async () => {
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');
    localStorage.setItem('lostfound-theme-mode', 'dark');
    localStorage.setItem('lostfound-theme-variant', '2');

    const fixture = await renderShell('/publications');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-variant')).toBe('2');

    await router.navigateByUrl('/found');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-variant')).toBe('2');

    localStorage.removeItem('lostfound-theme-mode');
    localStorage.removeItem('lostfound-theme-variant');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');
  });
});
