import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import {
  catchError,
  map,
  of,
  shareReplay,
  tap,
  throwError,
} from 'rxjs';
import { environment } from '../../environments/environment';
import type { MeResponse, UserRole } from './identity.models';

@Injectable({ providedIn: 'root' })
export class IdentityService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/v1/me`;
  private readonly roleState = signal<UserRole | null>(null);
  private pendingRequest: Observable<UserRole> | null = null;
  private generation = 0;

  readonly role = this.roleState.asReadonly();
  readonly isAdmin = computed(() => this.roleState() === 'ADMIN');

  load(): Observable<UserRole> {
    const role = this.roleState();

    if (role) {
      return of(role);
    }

    if (!this.pendingRequest) {
      const generation = this.generation;
      this.pendingRequest = this.http.get<MeResponse>(this.endpoint).pipe(
        map((response) => response.role),
        tap((nextRole) => {
          if (generation === this.generation) {
            this.roleState.set(nextRole);
          }
        }),
        catchError((error: unknown) => {
          if (generation === this.generation) {
            this.pendingRequest = null;
          }
          return throwError(() => error);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    }

    return this.pendingRequest;
  }

  reset(): void {
    this.generation += 1;
    this.roleState.set(null);
    this.pendingRequest = null;
  }
}
