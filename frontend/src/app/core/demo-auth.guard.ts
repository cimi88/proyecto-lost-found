import { Injectable, inject } from '@angular/core';
import { Router, type CanActivate, type UrlTree } from '@angular/router';
import type { Observable } from 'rxjs';
import { catchError, map, of } from 'rxjs';
import { DemoSessionService } from './demo-session.service';
import { IdentityService } from './identity.service';

@Injectable({ providedIn: 'root' })
export class DemoAuthGuard implements CanActivate {
  private readonly session = inject(DemoSessionService);
  private readonly identity = inject(IdentityService);
  private readonly router = inject(Router);

  canActivate(): Observable<boolean | UrlTree> {
    if (!this.session.isAuthenticated()) {
      return of(this.router.createUrlTree(['/']));
    }

    return this.identity.load().pipe(
      map(() => true),
      catchError(() => {
        this.session.clear();
        this.identity.reset();
        return of(this.router.createUrlTree(['/']));
      }),
    );
  }
}

@Injectable({ providedIn: 'root' })
export class DemoGuestGuard implements CanActivate {
  private readonly session = inject(DemoSessionService);
  private readonly router = inject(Router);

  canActivate(): boolean | UrlTree {
    return this.session.isAuthenticated()
      ? this.router.createUrlTree(['/publications'])
      : true;
  }
}
