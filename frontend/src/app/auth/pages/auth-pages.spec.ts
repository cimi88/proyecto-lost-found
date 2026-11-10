import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { Component } from '@angular/core';
import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import {
  DEMO_SESSION_STORAGE_KEY,
  DEMO_USER_A_ID,
  DEMO_USER_B_ID,
  DemoSessionService,
} from '../../core/demo-session.service';
import { AccessPageComponent } from './access-page.component';
import { LoginPageComponent } from './login-page.component';
import { RegisterPageComponent } from './register-page.component';

@Component({ template: '' })
class PublicationsPlaceholderComponent {}

const ME_ENDPOINT = `${environment.apiBaseUrl}/v1/me`;

describe('demo access pages', () => {
  let httpMock: HttpTestingController | null = null;

  afterEach(() => {
    httpMock?.verify();
    httpMock = null;
    localStorage.clear();
    sessionStorage.clear();
  });

  function configureForAccess<T>(component: Type<T>) {
    TestBed.configureTestingModule({
      imports: [component],
      providers: [provideRouter([])],
    });
    return TestBed.createComponent(component);
  }

  async function configureForLogin() {
    await TestBed.configureTestingModule({
      imports: [LoginPageComponent],
      providers: [
        provideRouter([
          {
            path: 'publications',
            component: PublicationsPlaceholderComponent,
          },
        ]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);
    return {
      fixture: TestBed.createComponent(LoginPageComponent),
      router: TestBed.inject(Router),
    };
  }

  it('shows the two initial access options', () => {
    const fixture = configureForAccess(AccessPageComponent);
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector('[data-testid="access-register"]')
        ?.textContent,
    ).toContain('Registrarse');
    expect(
      fixture.nativeElement.querySelector('[data-testid="access-login"]')
        ?.textContent,
    ).toContain('Iniciar sesión');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="access-register"]')
        ?.getAttribute('href'),
    ).toBe('/register');
    expect(
      fixture.nativeElement
        .querySelector('[data-testid="access-login"]')
        ?.getAttribute('href'),
    ).toBe('/login');
  });

  it('does not persist registration data and explains that it is simulated', () => {
    const fixture = configureForAccess(RegisterPageComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    component.form.setValue({
      displayName: 'Persona Demo',
      email: 'persona@example.test',
      password: 'secreto-demo',
    });
    component.submit();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="register-demo-message"]',
      )?.textContent,
    ).toContain('registro real todavía no está habilitado');
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="register-continue-login"]',
      )?.getAttribute('href'),
    ).toBe('/login');
    expect(localStorage.length).toBe(0);
    expect(component.form.getRawValue()).toEqual({
      displayName: '',
      email: '',
      password: '',
    });
    expect(localStorage.getItem('persona@example.test')).toBeNull();
    expect(localStorage.getItem('secreto-demo')).toBeNull();
  });

  it('offers only the two fixed demo profiles and no admin selection', async () => {
    const { fixture } = await configureForLogin();
    fixture.detectChanges();

    const cards = fixture.nativeElement.querySelectorAll('.profile-card');
    expect(cards.length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('ADMIN');
    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="demo-profile-11111111-1111-4111-8111-111111111111"]',
      ),
    ).toBeNull();
  });

  it.each([
    ['Usuario demo A', DEMO_USER_A_ID],
    ['Usuario demo B', DEMO_USER_B_ID],
  ])('logs in with %s using the fixed demo UUID', async (label, id) => {
    localStorage.clear();
    const { fixture, router } = await configureForLogin();
    const component = fixture.componentInstance;
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      `[data-testid="demo-profile-${id}"]`,
    ) as HTMLButtonElement;
    expect(button).not.toBeNull();
    expect(button.textContent).toContain(label);

    button.click();
    fixture.detectChanges();

    const identityRequest = httpMock?.expectOne(ME_ENDPOINT);
    expect(
      identityRequest?.request.headers.get('X-Demo-User-Id'),
    ).toBe(id);
    identityRequest?.flush({ role: 'USER' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.errorMessage()).toBeNull();
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBe(id);
    expect(TestBed.inject(DemoSessionService).activeProfile()?.id).toBe(id);
    expect(router.url).toBe('/publications');
  });
});
