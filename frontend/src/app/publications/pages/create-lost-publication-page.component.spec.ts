import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import { DEMO_USER_A_ID, DemoSessionService } from '../../core/demo-session.service';
import { CreateLostPublicationPageComponent } from './create-lost-publication-page.component';

const VALID_VALUES = {
  title: 'Bicicleta rodado 29',
  description: 'Bicicleta azul con canasto negro y una calcomanía.',
  category: 'SPORTS',
  location: 'Plaza San Martín',
  eventDate: '2024-05-10',
};

const ENDPOINT = `${environment.apiBaseUrl}/v1/lost-publications`;
const SAVED_ID = '11111111-1111-4111-8111-111111111111';

describe('CreateLostPublicationPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateLostPublicationPageComponent],
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(
      CreateLostPublicationPageComponent,
    );
    fixture.detectChanges();
    return fixture;
  }

  it('does not call the API when the form is invalid', () => {
    const fixture = createFixture();

    fixture.componentInstance.submit();

    httpMock.expectNone(ENDPOINT);
    expect(fixture.componentInstance.form.controls.title.touched).toBe(true);
  });

  it('updates the description counter and respects the limit', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    const counter = () =>
      fixture.nativeElement.querySelector(
        '[data-testid="create-lost-description-counter"]',
      )?.textContent?.trim();

    expect(counter()).toBe('0 / 1000');

    component.form.controls.description.setValue('Bicicleta azul');
    fixture.detectChanges();
    expect(counter()).toBe('14 / 1000');

    component.form.controls.description.setValue('x'.repeat(1000));
    fixture.detectChanges();
    expect(counter()).toBe('1000 / 1000');
    expect(
      fixture.nativeElement.querySelector('#description')?.getAttribute(
        'maxlength',
      ),
    ).toBe('1000');
    expect(
      component.form.controls.description.hasError('maxlength'),
    ).toBe(false);
  });

  it('posts a valid form with the demo identity header and shows success', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.form.setValue(VALID_VALUES);
    component.submit();

    const request = httpMock.expectOne(ENDPOINT);

    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );
    expect(request.request.body).toEqual(VALID_VALUES);

    request.flush({
      id: SAVED_ID,
      type: 'LOST',
      status: 'ACTIVE',
      ownerId: environment.demoIdentity.userId,
      ...VALID_VALUES,
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
    });
    fixture.detectChanges();

    expect(component.success()?.id).toBe(SAVED_ID);
    expect(component.form.controls.title.value).toBe('');
    expect(
      fixture.nativeElement.querySelector('[data-testid="success-panel"]'),
    ).not.toBeNull();
  });

  it('maps 400 details to field errors', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.form.setValue(VALID_VALUES);
    component.submit();

    httpMock.expectOne(ENDPOINT).flush(
      {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: [
          {
            field: 'title',
            message: 'El título debe tener entre 3 y 120 caracteres.',
          },
        ],
      },
      { status: 400, statusText: 'Bad Request' },
    );
    fixture.detectChanges();

    expect(component.fieldErrors()['title']).toContain('título');
    expect(component.errorMessage()).toBe('Revisá los datos del formulario.');
    expect(
      fixture.nativeElement.querySelector('#title-error')?.textContent,
    ).toContain('título');
  });

  it('shows a demo identity message on 401', () => {
    const fixture = createFixture();
    const component = fixture.componentInstance;
    component.form.setValue(VALID_VALUES);
    component.submit();

    httpMock.expectOne(ENDPOINT).flush(
      { statusCode: 401, code: 'DEMO_IDENTITY_INVALID', message: 'invalid' },
      { status: 401, statusText: 'Unauthorized' },
    );
    fixture.detectChanges();

    expect(component.errorMessage()).toContain('demostración');
    expect(
      fixture.nativeElement.querySelector('[data-testid="error-panel"]'),
    ).not.toBeNull();
  });
});
