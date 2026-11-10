import { Injectable, computed, signal } from '@angular/core';
import { environment } from '../../environments/environment';

export const DEMO_USER_A_ID = '00000000-0000-4000-8000-000000000001';
export const DEMO_USER_B_ID = '00000000-0000-4000-8000-000000000002';
export const DEMO_SESSION_STORAGE_KEY = 'lostfound.demo-session.v1';

export interface DemoProfile {
  id: string;
  label: string;
  description: string;
}

export const DEMO_PROFILES: readonly DemoProfile[] = [
  {
    id: DEMO_USER_A_ID,
    label: 'Usuario demo A',
    description: 'Usuario Demo',
  },
  {
    id: DEMO_USER_B_ID,
    label: 'Usuario demo B',
    description: 'Usuario Solicitante',
  },
];

@Injectable({ providedIn: 'root' })
export class DemoSessionService {
  private readonly activeState = signal<DemoProfile | null>(this.readStored());

  readonly activeProfile = this.activeState.asReadonly();
  readonly isAuthenticated = computed(() => this.activeState() !== null);
  readonly profiles = DEMO_PROFILES;

  select(userId: string): DemoProfile | null {
    if (!environment.demoIdentity.enabled || typeof window === 'undefined') {
      return null;
    }

    const profile =
      DEMO_PROFILES.find((candidate) => candidate.id === userId) ?? null;

    if (!profile) {
      return null;
    }

    try {
      window.localStorage.setItem(DEMO_SESSION_STORAGE_KEY, profile.id);
    } catch {
      return null;
    }

    this.activeState.set(profile);
    return profile;
  }

  clear(): void {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem(DEMO_SESSION_STORAGE_KEY);
      } catch {
        // The in-memory session is cleared even if storage is unavailable.
      }
    }

    this.activeState.set(null);
  }

  private readStored(): DemoProfile | null {
    if (!environment.demoIdentity.enabled || typeof window === 'undefined') {
      return null;
    }

    try {
      const stored = window.localStorage.getItem(DEMO_SESSION_STORAGE_KEY);
      return (
        DEMO_PROFILES.find((candidate) => candidate.id === stored) ?? null
      );
    } catch {
      return null;
    }
  }
}
