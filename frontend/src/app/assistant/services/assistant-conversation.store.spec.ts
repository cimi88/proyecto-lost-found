import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import {
  DEMO_USER_A_ID,
  DEMO_USER_B_ID,
  DemoSessionService,
} from '../../core/demo-session.service';
import type {
  AssistantConversation,
  AssistantPendingAction,
} from '../models/assistant.models';
import { AssistantConversationStorage } from './assistant-conversation-storage.service';
import { AssistantConversationStore } from './assistant-conversation.store';

function action(
  status: AssistantPendingAction['status'],
  errorCode?: string,
): AssistantPendingAction {
  return {
    action_id: `action-${status}`,
    action_type: 'CREATE_LOST_PUBLICATION',
    title: 'Acción',
    fields: [],
    expires_at: '2026-11-10T12:05:00.000Z',
    status,
    errorCode,
  };
}

function conversation(
  id: string,
  actions: AssistantPendingAction[] = [],
): AssistantConversation {
  return {
    id,
    title: `Conversación ${id}`,
    createdAt: '2026-11-10T12:00:00.000Z',
    updatedAt: '2026-11-10T12:00:00.000Z',
    messages: [
      { role: 'user', content: 'Mensaje anterior' },
      ...actions.map((pendingAction) => ({
        role: 'assistant' as const,
        content: 'Respuesta anterior',
        pendingAction,
      })),
    ],
  };
}

describe('AssistantConversationStore', () => {
  let httpMock: HttpTestingController;
  let storage: AssistantConversationStorage;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    storage = TestBed.inject(AssistantConversationStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('sends only the last 10 messages of the active conversation', () => {
    const store = TestBed.inject(AssistantConversationStore);

    for (let index = 0; index < 6; index += 1) {
      store.send(`mensaje ${index}`);
      httpMock
        .expectOne(`${environment.assistantBaseUrl}/chat`)
        .flush({ reply: `respuesta ${index}`, role: 'USER' });
    }

    store.send('mensaje 6');
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    expect(request.request.body.history).toHaveLength(10);
    expect(request.request.body.message).toBe('mensaje 6');
    request.flush({ reply: 'respuesta 6', role: 'USER' });
  });

  it('truncates model context to 2000 characters without changing stored content', () => {
    const store = TestBed.inject(AssistantConversationStore);

    store.send('primera consulta');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'x'.repeat(2500), role: 'USER' });

    store.send('segunda consulta');
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    const history = request.request.body.history as Array<{
      role: string;
      content: string;
    }>;

    expect(history).toHaveLength(2);
    expect(history[1].content).toHaveLength(2000);
    expect(history[1].content).toBe('x'.repeat(2000));

    const stored = storage.load();
    expect(stored[0].messages[1].content).toHaveLength(2500);
    request.flush({ reply: 'respuesta', role: 'USER' });
  });

  it('uses truncated context when continuing a historical conversation', () => {
    const source = conversation('source');
    source.messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `${index}:` + 'y'.repeat(index === 11 ? 2500 : 5),
    }));
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    store.continueConversation(source.id);
    store.send('continuar');
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    const history = request.request.body.history as Array<{
      content: string;
    }>;

    expect(history).toHaveLength(10);
    expect(history.at(-1)?.content).toHaveLength(2000);
    const storedSource = storage
      .load()
      .find((item) => item.id === source.id);
    expect(storedSource?.messages[11].content).toHaveLength(2503);
    request.flush({ reply: 'respuesta', role: 'USER' });
  });

  it('does not include action metadata in the model context', () => {
    const source = conversation('source', [action('PENDING')]);
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush({
        conversation_id: source.id,
        archived: true,
        superseded: 1,
      });
    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/action-PENDING`,
      )
      .flush({
        action_id: 'action-PENDING',
        action_type: 'CREATE_LOST_PUBLICATION',
        status: 'SUPERSEDED',
        created_at: '2026-11-10T12:00:00.000Z',
        expires_at: '2026-11-10T12:05:00.000Z',
        result: null,
        error: null,
        result_unknown: false,
      });

    store.continueConversation(source.id);
    store.send('continuar');
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    const history = request.request.body.history as Array<
      Record<string, unknown>
    >;

    for (const message of history) {
      expect(Object.keys(message).sort()).toEqual(['content', 'role']);
    }
    request.flush({ reply: 'respuesta', role: 'USER' });
  });

  it('does not mix messages from archived conversations into the active context', () => {
    storage.save([conversation('another')]);
    const store = TestBed.inject(AssistantConversationStore);

    store.send('consulta activa');
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    expect(request.request.body.history).toEqual([]);
    request.flush({ reply: 'respuesta', role: 'USER' });
  });

  it('keeps tokens when archival fails', () => {
    const store = TestBed.inject(AssistantConversationStore);
    store.send('preparar');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '11111111-1111-4111-8111-111111111111',
          action_type: 'CREATE_LOST_PUBLICATION',
          title: 'Registrar objeto perdido',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'test-token',
        },
      });

    const action = store.messages().at(-1)?.pendingAction;
    const conversationId = store.conversationId;
    expect(action).toBeDefined();
    expect(store.canConfirmPendingAction(action!)).toBe(true);

    store.deleteConversation(conversationId);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );

    expect(store.conversationId).toBe(conversationId);
    expect(store.canConfirmPendingAction(action!)).toBe(true);
  });

  it('keeps all stored conversations without automatic quantity pruning', () => {
    const items = Array.from({ length: 51 }, (_, index) =>
      conversation(String(index).padStart(2, '0')),
    );
    storage.save(items);

    expect(storage.load()).toHaveLength(51);
  });

  it('archives a conversation before deleting it locally', () => {
    const source = conversation('delete-me');
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    expect(store.conversations().some((item) => item.id === source.id)).toBe(
      true,
    );
    store.deleteConversation(source.id);

    const archive = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
    );
    archive.flush({
      conversation_id: source.id,
      archived: true,
      superseded: 0,
    });

    expect(store.conversations().some((item) => item.id === source.id)).toBe(
      false,
    );
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/confirm`);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/cancel`);
  });

  it('keeps the conversation when archival fails', () => {
    const source = conversation('keep-me');
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    store.deleteConversation(source.id);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );

    expect(store.conversations().some((item) => item.id === source.id)).toBe(
      true,
    );
    expect(store.deleteError()).toContain('No se pudo archivar');
  });

  it('creates a new empty conversation after deleting the active one', () => {
    const store = TestBed.inject(AssistantConversationStore);
    store.send('hola');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'respuesta', role: 'USER' });
    const previousId = store.conversationId;

    store.deleteConversation(previousId);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${previousId}/archive`,
      )
      .flush({
        conversation_id: previousId,
        archived: true,
        superseded: 0,
      });

    expect(store.conversationId).not.toBe(previousId);
    expect(store.currentConversation().messages).toEqual([]);
  });

  it('blocks deletion for non-safe action states', () => {
    const store = TestBed.inject(AssistantConversationStore);
    const blocked = [
      action('EXECUTING'),
      action('UNVERIFIED'),
      action('FAILED', 'ACTION_RESULT_UNKNOWN'),
    ];
    const allowed = [
      action('PENDING'),
      action('COMPLETED'),
      action('CANCELLED'),
      action('EXPIRED'),
      action('SUPERSEDED'),
      action('FAILED', 'ACTION_EXECUTION_FAILED'),
    ];

    for (const pendingAction of blocked) {
      expect(
        store.canDeleteConversation(conversation('blocked', [pendingAction])),
      ).toBe(false);
    }

    for (const pendingAction of allowed) {
      expect(
        store.canDeleteConversation(conversation('allowed', [pendingAction])),
      ).toBe(true);
    }

    expect(
      store.deleteBlockReason(
        conversation('executing', [action('EXECUTING')]),
      ),
    ).toContain('operación en ejecución');
    expect(
      store.deleteBlockReason(
        conversation('unknown', [
          action('FAILED', 'ACTION_RESULT_UNKNOWN'),
        ]),
      ),
    ).toContain('todavía no se pudo verificar el resultado');
    expect(
      store.deleteBlockReason(
        conversation('unverified', [action('UNVERIFIED')]),
      ),
    ).toContain('hasta verificar el estado');
  });

  it('allows deleting a conversation with a pending action and warns about it', () => {
    const store = TestBed.inject(AssistantConversationStore);
    store.send('preparar');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '22222222-2222-4222-8222-222222222222',
          action_type: 'CREATE_RECOVERY_REQUEST',
          title: 'Solicitar recuperación',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'pending-token',
        },
      });

    const target = store.currentConversation();
    expect(store.deleteWarning(target)).toContain(
      'descartará la acción pendiente',
    );
    expect(store.canDeleteConversation(target)).toBe(true);

    store.deleteConversation(target.id);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${target.id}/archive`,
      )
      .flush({
        conversation_id: target.id,
        archived: true,
        superseded: 1,
      });

    expect(store.conversationId).not.toBe(target.id);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/confirm`);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/cancel`);
  });

  it('preserves the conversation and tokens when the backend rejects archive', () => {
    const store = TestBed.inject(AssistantConversationStore);
    store.send('preparar');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '33333333-3333-4333-8333-333333333333',
          action_type: 'CREATE_LOST_PUBLICATION',
          title: 'Registrar objeto perdido',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'conflict-token',
        },
      });

    const target = store.currentConversation();
    const actionToConfirm = target.messages.at(-1)?.pendingAction;
    store.deleteConversation(target.id);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${target.id}/archive`,
      )
      .flush(
        {
          statusCode: 409,
          code: 'CONVERSATION_ACTION_IN_PROGRESS',
          message: 'executing',
        },
        { status: 409, statusText: 'Conflict' },
      );

    expect(store.conversationId).toBe(target.id);
    expect(store.deleteError()).toContain('operación en ejecución');
    expect(
      store.canConfirmPendingAction(actionToConfirm!),
    ).toBe(true);
    expect(
      (
        store as unknown as {
          confirmationTokens: Map<string, string>;
        }
      ).confirmationTokens.size,
    ).toBe(1);
  });

  it('verifies an unverified action remotely before allowing deletion', () => {
    const source = conversation('unverified', [action('UNVERIFIED')]);
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );

    let allowed = false;
    store
      .verifyConversationForDeletion(source.id)
      .subscribe((value) => {
        allowed = value;
      });

    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/action-UNVERIFIED`,
      )
      .flush({
        action_id: 'action-UNVERIFIED',
        action_type: 'CREATE_LOST_PUBLICATION',
        status: 'SUPERSEDED',
        created_at: '2026-11-10T12:00:00.000Z',
        expires_at: '2026-11-10T12:05:00.000Z',
        result: null,
        error: null,
        result_unknown: false,
      });

    expect(allowed).toBe(true);
    const updated = store
      .conversations()
      .find((item) => item.id === source.id);
    expect(updated?.messages.at(-1)?.pendingAction?.status).toBe(
      'SUPERSEDED',
    );
  });

  it('keeps the block when remote verification cannot be completed', () => {
    const source = conversation('unverified-error', [
      action('UNVERIFIED'),
    ]);
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );

    let allowed = true;
    store
      .verifyConversationForDeletion(source.id)
      .subscribe((value) => {
        allowed = value;
      });

    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/action-UNVERIFIED`,
      )
      .flush(
        new ErrorEvent('NetworkError'),
        { status: 0, statusText: 'Unknown Error' },
      );

    expect(allowed).toBe(false);
    expect(store.deleteBlockReason(source)).toContain(
      'hasta verificar el estado',
    );
  });

  it('keeps the block when remote verification reports an executing action', () => {
    const source = conversation('unverified-executing', [
      action('UNVERIFIED'),
    ]);
    storage.save([source]);
    const store = TestBed.inject(AssistantConversationStore);

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );

    let allowed = true;
    store
      .verifyConversationForDeletion(source.id)
      .subscribe((value) => {
        allowed = value;
      });

    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/action-UNVERIFIED`,
      )
      .flush({
        action_id: 'action-UNVERIFIED',
        action_type: 'CREATE_LOST_PUBLICATION',
        status: 'EXECUTING',
        created_at: '2026-11-10T12:00:00.000Z',
        expires_at: '2026-11-10T12:05:00.000Z',
        result: null,
        error: null,
        result_unknown: false,
      });

    expect(allowed).toBe(false);
    const updated = store
      .conversations()
      .find((item) => item.id === source.id);
    expect(updated).toBeDefined();
    expect(store.deleteBlockReason(updated!)).toContain(
      'operación en ejecución',
    );
  });

  it('does not cancel a completed recovery request when deleting the chat', () => {
    const store = TestBed.inject(AssistantConversationStore);
    store.send('preparar recuperación');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la solicitud.',
        role: 'USER',
        pending_action: {
          action_id: '99999999-9999-4999-8999-999999999999',
          action_type: 'CREATE_RECOVERY_REQUEST',
          title: 'Solicitar recuperación',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'recovery-token',
        },
      });

    const action = store.currentConversation().messages.at(-1)!
      .pendingAction!;
    const conversationId = store.conversationId;
    store.confirmPendingAction(action);
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat/confirm`)
      .flush({
        action_id: action.action_id,
        action_type: action.action_type,
        status: 'COMPLETED',
        result: { id: 'recovery-1' },
        message: 'Solicitud creada',
      });

    store.deleteConversation(conversationId);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
      )
      .flush({
        conversation_id: conversationId,
        archived: true,
        superseded: 0,
      });

    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/cancel`);
    expect(
      store.conversations().some((item) => item.id === conversationId),
    ).toBe(false);
  });

  it('completes pending local cleanup after reloading the store', () => {
    const source = conversation('pending-cleanup');
    storage.save([source]);
    storage.markPendingDeletion(source.id);

    const store = TestBed.inject(AssistantConversationStore);

    expect(store.conversations().some((item) => item.id === source.id)).toBe(
      false,
    );
    expect(storage.load().some((item) => item.id === source.id)).toBe(
      false,
    );
    expect(storage.loadPendingDeletions()).not.toContain(source.id);
  });

  it('reloads assistant history when the demo identity changes', () => {
    const session = TestBed.inject(DemoSessionService);
    const sourceA = conversation('history-a');
    const sourceB = conversation('history-b');

    session.select(DEMO_USER_A_ID);
    storage.save([sourceA]);
    const store = TestBed.inject(AssistantConversationStore);

    expect(
      store.conversations().some((item) => item.id === sourceA.id),
    ).toBe(true);

    session.select(DEMO_USER_B_ID);
    storage.save([sourceB]);
    store.resetForIdentityChange();

    expect(
      store.conversations().some((item) => item.id === sourceA.id),
    ).toBe(false);
    expect(
      store.conversations().some((item) => item.id === sourceB.id),
    ).toBe(true);
  });

  it('keeps local state and tokens until a retried local cleanup succeeds', () => {
    const other = conversation('other');
    storage.save([other]);
    const store = TestBed.inject(AssistantConversationStore);
    store.send('preparar');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '44444444-4444-4444-8444-444444444444',
          action_type: 'CREATE_RECOVERY_REQUEST',
          title: 'Solicitar recuperación',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'retry-token',
        },
      });

    const target = store.currentConversation();
    const originalSetItem = Storage.prototype.setItem;
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(function (
        this: Storage,
        key: string,
        value: string,
      ) {
        if (this === window.localStorage) {
          throw new Error('QuotaExceededError');
        }
        originalSetItem.call(this, key, value);
      });

    store.deleteConversation(target.id);
    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${target.id}/archive`,
      )
      .flush({
        conversation_id: target.id,
        archived: true,
        superseded: 1,
      });

    expect(store.conversationId).toBe(target.id);
    expect(store.isRemotelyArchived(target.id)).toBe(true);
    expect(store.deleteError()).toContain('archivado en el servidor');
    expect(store.canConfirmPendingAction(
      target.messages.at(-1)!.pendingAction!,
    )).toBe(false);
    expect(
      (
        store as unknown as {
          confirmationTokens: Map<string, string>;
        }
      ).confirmationTokens.size,
    ).toBe(1);
    expect(storage.load().some((item) => item.id === target.id)).toBe(
      true,
    );
    expect(storage.loadPendingDeletions()).toContain(target.id);
    expect(
      store.conversations().some((item) => item.id === other.id),
    ).toBe(true);

    store.selectConversation(other.id);
    expect(store.conversationId).toBe(target.id);

    setItem.mockRestore();
    store.deleteConversation(target.id);
    httpMock.expectNone(
      `${environment.assistantBaseUrl}/chat/conversations/${target.id}/archive`,
    );
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/confirm`);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/cancel`);

    expect(store.conversationId).not.toBe(target.id);
    expect(store.isRemotelyArchived(target.id)).toBe(false);
    expect(storage.load().some((item) => item.id === target.id)).toBe(
      false,
    );
    expect(
      store.conversations().some((item) => item.id === other.id),
    ).toBe(true);
    expect(storage.loadPendingDeletions()).not.toContain(target.id);
  });
});
