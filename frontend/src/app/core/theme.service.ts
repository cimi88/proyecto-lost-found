import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';
export type ThemeVariant = 1 | 2;

export const THEME_STORAGE_KEY = 'lostfound-theme';
export const THEME_MODE_STORAGE_KEY = 'lostfound-theme-mode';
export const THEME_VARIANT_STORAGE_KEY = 'lostfound-theme-variant';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly currentMode = signal<ThemeMode>(this.initialMode());
  private readonly currentVariant = signal<ThemeVariant>(
    this.initialVariant(),
  );

  readonly mode = this.currentMode.asReadonly();
  readonly variant = this.currentVariant.asReadonly();
  /** Compatibility alias: the current light/dark mode. */
  readonly theme = this.mode;
  readonly isDark = computed(() => this.currentMode() === 'dark');

  constructor() {
    this.apply();
  }

  toggle(): void {
    this.setTheme(this.isDark() ? 'light' : 'dark', this.currentVariant());
  }

  setTheme(mode: ThemeMode, variant: ThemeVariant): void {
    this.currentMode.set(mode);
    this.currentVariant.set(variant);
    this.apply();
    this.persist();
  }

  setVariant(variant: ThemeVariant): void {
    this.setTheme(this.currentMode(), variant);
  }

  private initialMode(): ThemeMode {
    const documentMode =
      this.document.documentElement.getAttribute('data-theme');

    if (documentMode === 'light' || documentMode === 'dark') {
      return documentMode;
    }

    try {
      const stored =
        window.localStorage.getItem(THEME_MODE_STORAGE_KEY) ??
        window.localStorage.getItem(THEME_STORAGE_KEY);

      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // localStorage may be unavailable in restricted contexts
    }

    try {
      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
      }
    } catch {
      // matchMedia may be unavailable in older environments
    }

    return 'light';
  }

  private initialVariant(): ThemeVariant {
    const documentVariant =
      this.document.documentElement.getAttribute('data-variant');

    if (documentVariant === '2') {
      return 2;
    }

    try {
      const stored = window.localStorage.getItem(THEME_VARIANT_STORAGE_KEY);
      return stored === '2' ? 2 : 1;
    } catch {
      return 1;
    }
  }

  private apply(): void {
    this.document.documentElement.setAttribute('data-theme', this.currentMode());
    this.document.documentElement.setAttribute(
      'data-variant',
      String(this.currentVariant()),
    );
    this.document.documentElement.style.colorScheme = this.currentMode();
  }

  private persist(): void {
    try {
      window.localStorage.setItem(THEME_MODE_STORAGE_KEY, this.currentMode());
      window.localStorage.setItem(
        THEME_VARIANT_STORAGE_KEY,
        String(this.currentVariant()),
      );
      // Keep the old key in sync for existing local preferences.
      window.localStorage.setItem(THEME_STORAGE_KEY, this.currentMode());
    } catch {
      // The selected appearance still applies for the current session.
    }
  }
}
