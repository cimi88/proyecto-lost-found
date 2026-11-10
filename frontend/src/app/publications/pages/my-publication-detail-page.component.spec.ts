import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  provideRouter,
} from '@angular/router';
import { of } from 'rxjs';
import { environment } from '../../../environments/environment';
import type { OwnPublication } from '../models/publication-management.models';
import { MyPublicationDetailPageComponent } from './my-publication-detail-page.component';

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

describe('MyPublicationDetailPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MyPublicationDetailPageComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: { paramMap: of(convertToParamMap({ id: ID })) },
        },
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function render() {
    const fixture = TestBed.createComponent(MyPublicationDetailPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function byTestId(fixture: ReturnType<typeof render>, id: string) {
    return fixture.nativeElement.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  }

  it('loads and displays an own publication in any state', () => {
    const fixture = render();
    expect(byTestId(fixture, 'my-publication-detail-loading')).not.toBeNull();

    httpMock
      .expectOne(`${BASE}/mine/${ID}`)
      .flush({ ...PUBLICATION, status: 'RETURNED' });
    fixture.detectChanges();

    expect(byTestId(fixture, 'my-publication-detail')?.textContent).toContain(
      'Devuelta',
    );
    expect(byTestId(fixture, 'my-publication-detail-edit')).toBeNull();
    expect(
      byTestId(fixture, 'my-publication-detail-requests')?.getAttribute('href'),
    ).toContain(`publicationId=${ID}`);
  });

  it('shows the edit action only for ACTIVE and handles not found', () => {
    const fixture = render();
    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
    fixture.detectChanges();
    expect(byTestId(fixture, 'my-publication-detail-edit')).not.toBeNull();

    const missing = render();
    httpMock
      .expectOne(`${BASE}/mine/${ID}`)
      .flush({ statusCode: 404, message: 'not found' }, { status: 404, statusText: 'Not Found' });
    missing.detectChanges();
    expect(byTestId(missing, 'my-publication-detail-not-found')).not.toBeNull();
  });

  it('shows a load error and retries', () => {
    const fixture = render();
    httpMock
      .expectOne(`${BASE}/mine/${ID}`)
      .flush({ statusCode: 500, message: 'error' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    expect(byTestId(fixture, 'my-publication-detail-error')).not.toBeNull();

    byTestId(fixture, 'my-publication-detail-retry')?.click();
    httpMock.expectOne(`${BASE}/mine/${ID}`).flush(PUBLICATION);
  });
});
