import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { AdminGuard } from './admin.guard';
import { IdentityService } from './identity.service';
import type { UserRole } from './identity.models';

function configureGuard(load: () => ReturnType<IdentityService['load']>) {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: IdentityService, useValue: { load } },
    ],
  });

  return {
    guard: TestBed.inject(AdminGuard),
    router: TestBed.inject(Router),
  };
}

describe('AdminGuard', () => {
  it('allows ADMIN', async () => {
    const { guard } = configureGuard(() => of<UserRole>('ADMIN'));

    await expect(firstValueFrom(guard.canActivate())).resolves.toBe(true);
  });

  it('redirects USER to publications', async () => {
    const { guard, router } = configureGuard(() => of<UserRole>('USER'));
    const result = await firstValueFrom(guard.canActivate());

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/publications');
  });

  it('redirects to the home page when the role cannot be loaded', async () => {
    const { guard, router } = configureGuard(() =>
      throwError(() => new Error('identity unavailable')),
    );
    const result = await firstValueFrom(guard.canActivate());

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/');
  });
});
