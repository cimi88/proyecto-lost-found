import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { DemoSessionService } from './demo-session.service';

/**
 * Adds the selected local demo identity while the demo seam is enabled.
 * Production disables it, and the backend rejects AUTH_MODE=demo there.
 */
export const demoIdentityInterceptor: HttpInterceptorFn = (
  request,
  next,
) => {
  const session = inject(DemoSessionService);
  const profile = session.activeProfile();

  if (!environment.demoIdentity.enabled || !profile) {
    return next(request);
  }

  return next(
    request.clone({
      setHeaders: { 'X-Demo-User-Id': profile.id },
    }),
  );
};
