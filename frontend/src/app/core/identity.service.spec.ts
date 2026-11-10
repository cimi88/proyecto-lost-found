import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { IdentityService } from './identity.service';

const ME_ENDPOINT = `${environment.apiBaseUrl}/v1/me`;

describe('IdentityService', () => {
  let service: IdentityService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(IdentityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads and caches the USER role', async () => {
    const first = firstValueFrom(service.load());
    const second = firstValueFrom(service.load());

    const request = httpMock.expectOne(ME_ENDPOINT);
    expect(request.request.method).toBe('GET');
    request.flush({ role: 'USER' });

    await expect(first).resolves.toBe('USER');
    await expect(second).resolves.toBe('USER');
    expect(service.role()).toBe('USER');
    expect(service.isAdmin()).toBe(false);
    httpMock.expectNone(ME_ENDPOINT);
  });

  it('exposes ADMIN and reuses the cached role', async () => {
    const first = firstValueFrom(service.load());
    httpMock.expectOne(ME_ENDPOINT).flush({ role: 'ADMIN' });

    await expect(first).resolves.toBe('ADMIN');
    expect(service.role()).toBe('ADMIN');
    expect(service.isAdmin()).toBe(true);

    await expect(firstValueFrom(service.load())).resolves.toBe('ADMIN');
    httpMock.expectNone(ME_ENDPOINT);
  });

  it('reloads the role after the identity cache is reset', async () => {
    const first = firstValueFrom(service.load());
    httpMock.expectOne(ME_ENDPOINT).flush({ role: 'USER' });
    await expect(first).resolves.toBe('USER');

    service.reset();
    const second = firstValueFrom(service.load());
    httpMock.expectOne(ME_ENDPOINT).flush({ role: 'ADMIN' });

    await expect(second).resolves.toBe('ADMIN');
    expect(service.role()).toBe('ADMIN');
    expect(service.isAdmin()).toBe(true);
  });
});
