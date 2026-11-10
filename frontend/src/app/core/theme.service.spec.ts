import { TestBed } from '@angular/core/testing';
import {
  THEME_MODE_STORAGE_KEY,
  THEME_STORAGE_KEY,
  THEME_VARIANT_STORAGE_KEY,
  ThemeService,
} from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.removeAttribute('data-variant');
  });

  it('starts in light mode with variant 1 when there is no preference', () => {
    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('light');
    expect(service.variant()).toBe(1);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.documentElement.getAttribute('data-variant')).toBe('1');
  });

  it('reads the saved mode and variant', () => {
    localStorage.setItem(THEME_MODE_STORAGE_KEY, 'dark');
    localStorage.setItem(THEME_VARIANT_STORAGE_KEY, '2');

    const service = TestBed.inject(ThemeService);

    expect(service.mode()).toBe('dark');
    expect(service.variant()).toBe(2);
    expect(service.isDark()).toBe(true);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-variant')).toBe('2');
  });

  it('persists mode and variant when the appearance changes', () => {
    const service = TestBed.inject(ThemeService);

    service.setTheme('dark', 2);

    expect(service.mode()).toBe('dark');
    expect(service.variant()).toBe(2);
    expect(localStorage.getItem(THEME_MODE_STORAGE_KEY)).toBe('dark');
    expect(localStorage.getItem(THEME_VARIANT_STORAGE_KEY)).toBe('2');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.getAttribute('data-variant')).toBe('2');

    service.setVariant(1);

    expect(service.mode()).toBe('dark');
    expect(service.variant()).toBe(1);
    expect(localStorage.getItem(THEME_VARIANT_STORAGE_KEY)).toBe('1');
  });
});
