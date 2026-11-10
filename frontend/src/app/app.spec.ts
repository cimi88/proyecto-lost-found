import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { environment } from '../environments/environment';
import { App } from './app';
import {
  DEMO_USER_A_ID,
  DemoSessionService,
} from './core/demo-session.service';

const ME_ENDPOINT = `${environment.apiBaseUrl}/v1/me`;

describe('App', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');

    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');
  });

  function flushIdentity(role: 'USER' | 'ADMIN' = 'USER'): void {
    httpMock.expectOne(ME_ENDPOINT).flush({ role });
  }

  it('creates the app shell with a router outlet', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushIdentity();
    fixture.detectChanges();

    expect(fixture.componentInstance).toBeTruthy();
    expect(fixture.nativeElement.querySelector('router-outlet')).not.toBeNull();
  });

  it('selects one of four appearances and persists it', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    flushIdentity();
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      '[data-testid="theme-toggle"]',
    ) as HTMLButtonElement;

    toggle.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelectorAll('.theme-option').length,
    ).toBe(4);

    const dark2 = fixture.nativeElement.querySelector(
      '[data-testid="theme-option-dark-2"]',
    ) as HTMLButtonElement;

    dark2.click();
    fixture.detectChanges();

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-variant')).toBe('2');
    expect(localStorage.getItem('lostfound-theme-mode')).toBe('dark');
    expect(localStorage.getItem('lostfound-theme-variant')).toBe('2');
    expect(fixture.nativeElement.querySelector('.theme-menu')).toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        '[data-testid="theme-option-light-1"]',
      ),
    ).not.toBeNull();
  });
});
