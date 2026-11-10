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
import {
  DEMO_USER_A_ID,
  DemoSessionService,
} from '../../core/demo-session.service';
import type { AssistantChatResponse } from '../models/assistant.models';
import { AssistantService } from './assistant.service';

const RESPONSE: AssistantChatResponse = {
  reply: 'Para buscar, abrí la sección Buscar.',
  role: 'USER',
};

describe('AssistantService', () => {
  let service: AssistantService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AssistantService);
    httpMock = TestBed.inject(HttpTestingController);
    TestBed.inject(DemoSessionService).select(DEMO_USER_A_ID);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('posts the message and ephemeral history with demo identity', () => {
    let response: AssistantChatResponse | undefined;

    service
      .chat(
        '¿Cómo busco?',
        [
          { role: 'user', content: 'Hola' },
          { role: 'assistant', content: '¿En qué te ayudo?' },
        ],
        '11111111-1111-4111-8111-111111111111',
      )
      .subscribe((value) => (response = value));

    const request = httpMock.expectOne(`${environment.assistantBaseUrl}/chat`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      message: '¿Cómo busco?',
      history: [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: '¿En qué te ayudo?' },
      ],
      conversation_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(request.request.headers.get('X-Demo-User-Id')).toBe(
      environment.demoIdentity.userId,
    );
    request.flush(RESPONSE);

    expect(response).toEqual(RESPONSE);
  });

  it('gets action status and archives conversations', () => {
    service
      .getActionStatus(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      )
      .subscribe();
    const status = httpMock.expectOne(
      (request) =>
        request.url ===
        `${environment.assistantBaseUrl}/chat/actions/22222222-2222-4222-8222-222222222222`,
    );
    expect(status.request.method).toBe('GET');
    expect(status.request.params.get('conversation_id')).toBe(
      '11111111-1111-4111-8111-111111111111',
    );
    status.flush({
      action_id: '22222222-2222-4222-8222-222222222222',
      action_type: 'CREATE_LOST_PUBLICATION',
      status: 'COMPLETED',
      created_at: '2026-11-09T10:00:00.000Z',
      expires_at: '2026-11-09T10:05:00.000Z',
      result: { id: '33333333-3333-4333-8333-333333333333' },
    });

    service
      .archiveConversation('11111111-1111-4111-8111-111111111111')
      .subscribe();
    const archive = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/conversations/11111111-1111-4111-8111-111111111111/archive`,
    );
    expect(archive.request.method).toBe('POST');
    archive.flush({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      archived: true,
      superseded: 1,
    });
  });

  it('confirms and cancels pending actions', () => {
    service
      .confirmAction(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        'confirmation-token',
      )
      .subscribe();
    const confirm = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/confirm`,
    );
    expect(confirm.request.body).toEqual({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      action_id: '22222222-2222-4222-8222-222222222222',
      confirmation_token: 'confirmation-token',
    });
    confirm.flush({
      action_id: '22222222-2222-4222-8222-222222222222',
      action_type: 'CREATE_LOST_PUBLICATION',
      status: 'COMPLETED',
      result: { id: '33333333-3333-4333-8333-333333333333' },
      message: 'La operación se completó correctamente.',
    });

    service
      .cancelAction(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
      )
      .subscribe();
    const cancel = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/cancel`,
    );
    expect(cancel.request.body).toEqual({
      conversation_id: '11111111-1111-4111-8111-111111111111',
      action_id: '22222222-2222-4222-8222-222222222222',
    });
    cancel.flush({
      action_id: '22222222-2222-4222-8222-222222222222',
      status: 'CANCELLED',
      message: 'La acción fue cancelada.',
    });
  });
});
