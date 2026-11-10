import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import type { OwnPublication } from '../models/publication-management.models';
import { PublicationManagementService } from './publication-management.service';

const BASE = `${environment.apiBaseUrl}/v1/publications`;
const ID = '11111111-1111-4111-8111-111111111111';

const PUBLICATION: OwnPublication = {
  id: ID,
  type: 'FOUND',
  status: 'ACTIVE',
  title: 'Mochila negra',
  description: 'Mochila negra con una marca azul.',
  category: 'BAGS',
  location: 'Plaza Central',
  eventDate: '2026-11-01',
  createdAt: '2026-11-06T10:00:00.000Z',
  updatedAt: '2026-11-06T10:00:00.000Z',
};

describe('PublicationManagementService', () => {
  let service: PublicationManagementService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });

    service = TestBed.inject(PublicationManagementService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('loads own publications and one own publication', () => {
    service.getMine().subscribe((items) => expect(items).toEqual([PUBLICATION]));
    const list = httpMock.expectOne(`${BASE}/mine`);
    expect(list.request.method).toBe('GET');
    list.flush([PUBLICATION]);

    service.getMineById(ID).subscribe((item) => expect(item).toEqual(PUBLICATION));
    const detail = httpMock.expectOne(`${BASE}/mine/${ID}`);
    expect(detail.request.method).toBe('GET');
    detail.flush(PUBLICATION);
  });

  it('loads the admin moderation list', () => {
    service
      .getForModeration()
      .subscribe((items) => expect(items).toEqual([PUBLICATION]));

    const request = httpMock.expectOne(
      `${environment.apiBaseUrl}/v1/admin/publications`,
    );
    expect(request.request.method).toBe('GET');
    request.flush([PUBLICATION]);
  });

  it('updates and closes an own publication with encoded ids', () => {
    const body = {
      title: 'Mochila negra actualizada',
      description: 'Mochila negra con una marca azul y una etiqueta nueva.',
      category: 'BAGS' as const,
      location: 'Plaza Central, banco 3',
      eventDate: '2026-11-02',
    };

    service.update('id with spaces', body).subscribe();
    const update = httpMock.expectOne(`${BASE}/id%20with%20spaces`);
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(body);
    update.flush({ ...PUBLICATION, ...body });

    service.close('id with spaces').subscribe();
    const close = httpMock.expectOne(`${BASE}/id%20with%20spaces/close`);
    expect(close.request.method).toBe('POST');
    expect(close.request.body).toEqual({});
    close.flush({ ...PUBLICATION, status: 'CLOSED' });
  });
});
