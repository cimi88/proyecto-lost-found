import { Injectable, inject } from '@angular/core';
import { Router, type CanActivate, type UrlTree } from '@angular/router';
import type { Observable } from 'rxjs';
import { catchError, map, of } from 'rxjs';
import { IdentityService } from './identity.service';

/**
 * Guard visual para la futura sección de moderación.
 * La autorización efectiva sigue dependiendo del backend.
 */
@Injectable({ providedIn: 'root' })
export class AdminGuard implements CanActivate {
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    return this.identity.load().pipe(
      map((role) =>
        role === 'ADMIN'
          ? true
          : this.router.createUrlTree(['/publications']),
      ),
      catchError(() => of(this.router.createUrlTree(['/']))),
    );
  }
}
