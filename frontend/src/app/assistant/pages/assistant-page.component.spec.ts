import {
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { environment } from '../../../environments/environment';
import { demoIdentityInterceptor } from '../../core/demo-identity.interceptor';
import type { AssistantConversation } from '../models/assistant.models';
import { AssistantConversationStorage } from '../services/assistant-conversation-storage.service';
import { AssistantPageComponent } from './assistant-page.component';

describe('AssistantPageComponent', () => {
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    httpMock.verify();
    sessionStorage.clear();
  });

  function render() {
    const fixture = TestBed.createComponent(AssistantPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  function panel(testId: string, fixture: ReturnType<typeof render>) {
    return fixture.nativeElement.querySelector(
      `[data-testid="${testId}"]`,
    ) as HTMLElement | null;
  }

  function flushHistorySync(
    conversationId: string,
    actionId: string,
  ): void {
    const archive = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
    );
    archive.flush({
      conversation_id: conversationId,
      archived: true,
      superseded: 1,
    });

    const status = httpMock.expectOne(
      (request) =>
        request.url ===
        `${environment.assistantBaseUrl}/chat/actions/${actionId}`,
    );
    status.flush({
      action_id: actionId,
      action_type: 'CREATE_FOUND_PUBLICATION',
      status: 'SUPERSEDED',
      created_at: '2026-11-09T10:00:00.000Z',
      expires_at: '2026-11-09T10:05:00.000Z',
      result: null,
      error: null,
      result_unknown: false,
    });
  }

  function historicalConversation(): AssistantConversation {
    const messages: AssistantConversation['messages'] = Array.from(
      { length: 12 },
      (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `Mensaje histórico ${index + 1}`,
    }));
    messages[11] = {
      role: 'assistant',
      content: 'Respuesta histórica con acción',
      pendingAction: {
        action_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action_type: 'CREATE_FOUND_PUBLICATION',
        title: 'Acción histórica',
        fields: [{ label: 'Título', value: 'No debe copiarse' }],
        expires_at: '2026-11-09T17:45:00Z',
        status: 'PENDING',
      },
    };

    return {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      title: 'Conversación histórica',
      createdAt: '2026-11-09T10:00:00.000Z',
      updatedAt: '2026-11-09T12:00:00.000Z',
      messages,
    };
  }

  it('updates the question counter and removes the static help text', () => {
    const fixture = render();
    const component = fixture.componentInstance;
    const counter = () =>
      panel('assistant-character-counter', fixture)?.textContent?.trim();

    expect(counter()).toBe('0 / 1000');
    expect(fixture.nativeElement.textContent).not.toContain(
      'Escribí una pregunta de hasta 1000 caracteres.',
    );

    component.input.setValue('Hola');
    fixture.detectChanges();
    expect(counter()).toBe('4 / 1000');

    component.input.setValue('x'.repeat(1000));
    fixture.detectChanges();
    expect(counter()).toBe('1000 / 1000');
    expect(
      panel('assistant-input', fixture)?.getAttribute('maxlength'),
    ).toBe('1000');
    expect(component.input.hasError('maxlength')).toBe(false);
  });

  it('shows an accessible three-dot loader only while waiting', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    expect(panel('assistant-loading', fixture)).toBeNull();

    component.input.setValue('Hola');
    component.send();
    fixture.detectChanges();

    const loading = panel('assistant-loading', fixture);
    expect(loading).not.toBeNull();
    expect(loading?.getAttribute('role')).toBe('status');
    expect(loading?.getAttribute('aria-live')).toBe('polite');
    const dots = loading?.querySelector('.thinking-loader');
    expect(dots).not.toBeNull();
    expect(dots?.getAttribute('aria-hidden')).toBe('true');
    expect(
      loading?.querySelector('.sr-only')?.textContent?.trim(),
    ).toBe('El asistente está pensando');
    expect(loading?.textContent).not.toContain(
      'El asistente está pensando…',
    );

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta', role: 'USER' });
    fixture.detectChanges();
    expect(panel('assistant-loading', fixture)).toBeNull();

    component.input.setValue('Otra consulta');
    component.send();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush(
        new ErrorEvent('NetworkError'),
        { status: 0, statusText: 'Unknown Error' },
      );
    fixture.detectChanges();
    expect(panel('assistant-loading', fixture)).toBeNull();
  });

  it('renders the current assistant scope and sends a message', () => {
    const fixture = render();

    expect(panel('assistant-empty', fixture)).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'puede explicar cómo usar LostFound',
    );
    expect(fixture.nativeElement.textContent).toContain(
      'requiere tu confirmación',
    );

    fixture.componentInstance.input.setValue('¿Cómo busco una publicación?');
    fixture.componentInstance.send();
    fixture.detectChanges();

    expect(panel('assistant-loading', fixture)).not.toBeNull();

    const request = httpMock.expectOne(`${environment.assistantBaseUrl}/chat`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({
      message: '¿Cómo busco una publicación?',
      history: [],
      conversation_id: fixture.componentInstance.conversationId,
    });
    request.flush({
      reply: 'Abrí la sección Buscar y escribí una palabra clave.',
      role: 'USER',
    });
    fixture.detectChanges();

    expect(panel('assistant-conversation', fixture)?.textContent).toContain(
      '¿Cómo busco una publicación?',
    );
    expect(panel('assistant-conversation', fixture)?.textContent).toContain(
      'Abrí la sección Buscar',
    );
    expect(panel('assistant-conversation', fixture)?.textContent).toContain(
      'Usuario',
    );
    expect(panel('assistant-loading', fixture)).toBeNull();
    expect(panel('assistant-pending-action', fixture)).toBeNull();
    expect(localStorage.length).toBe(1);
  });

  it('creates a new conversation after a reload while keeping the previous one', async () => {
    const first = render();
    first.componentInstance.send('Conversación persistida');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta persistida', role: 'USER' });
    first.detectChanges();
    const previousConversationId = first.componentInstance.conversationId;

    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([demoIdentityInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();
    httpMock = TestBed.inject(HttpTestingController);

    const reloaded = render();

    expect(reloaded.componentInstance.conversationId).not.toBe(
      previousConversationId,
    );
    expect(
      reloaded.componentInstance
        .historyItems()
        .some((item) => item.id === previousConversationId),
    ).toBe(true);
    expect(reloaded.componentInstance.messages()).toEqual([]);
  });

  it('marks a historical action unverified when status cannot be queried', () => {
    const historical = historicalConversation();
    TestBed.inject(AssistantConversationStorage).save([historical]);
    const fixture = render();
    const actionId =
      historical.messages[11].pendingAction!.action_id;

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${historical.id}/archive`,
      )
      .flush({
        conversation_id: historical.id,
        archived: true,
        superseded: 1,
      });
    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/${actionId}`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();

    const storedAction = fixture.componentInstance
      .historyItems()
      .find((item) => item.id === historical.id)
      ?.messages[11].pendingAction;
    expect(storedAction?.status).toBe('UNVERIFIED');
    expect(storedAction?.result).toBeUndefined();
  });

  it('requires confirmation and archives before deleting a saved conversation', () => {
    const source: AssistantConversation = {
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      title: 'Conversación a eliminar',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T11:00:00.000Z',
      messages: [
        { role: 'user', content: 'Mensaje guardado' },
        { role: 'assistant', content: 'Respuesta guardada' },
      ],
    };
    TestBed.inject(AssistantConversationStorage).save([source]);
    const fixture = render();
    fixture.componentInstance.toggleHistory();
    fixture.detectChanges();

    const findDeleteButton = () => {
      const rows = fixture.nativeElement.querySelectorAll(
        '.history-row',
      ) as NodeListOf<HTMLElement>;
      const row = Array.from(rows).find((element) =>
        element.textContent?.includes(source.title),
      );
      return row?.querySelector(
        '[data-testid="assistant-delete-conversation"]',
      ) as HTMLButtonElement | undefined;
    };

    findDeleteButton()?.click();
    fixture.detectChanges();
    const archiveUrl =
      `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`;

    expect(panel('assistant-delete-confirmation', fixture)).not.toBeNull();
    httpMock.expectNone(archiveUrl);
    panel('assistant-cancel-delete', fixture)?.click();
    fixture.detectChanges();
    expect(panel('assistant-delete-confirmation', fixture)).toBeNull();

    findDeleteButton()?.click();
    fixture.detectChanges();
    panel('assistant-confirm-delete', fixture)?.click();
    fixture.detectChanges();

    const archive = httpMock.expectOne(archiveUrl);
    expect(fixture.nativeElement.textContent).toContain(source.title);
    archive.flush({
      conversation_id: source.id,
      archived: true,
      superseded: 0,
    });
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain(source.title);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/confirm`);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat/cancel`);
  });

  it('keeps PENDING deletion enabled and explains that the action will be discarded', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    component.input.setValue('preparar');
    component.send();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '55555555-5555-4555-8555-555555555555',
          action_type: 'CREATE_RECOVERY_REQUEST',
          title: 'Solicitar recuperación',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'pending-token',
        },
      });
    fixture.detectChanges();
    component.toggleHistory();
    fixture.detectChanges();

    const row = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.history-row',
      ) as NodeListOf<HTMLElement>,
    ).find((element) => element.textContent?.includes('preparar'));
    const button = row?.querySelector(
      '[data-testid="assistant-delete-conversation"]',
    ) as HTMLButtonElement | undefined;

    expect(button?.disabled).toBe(false);
    expect(button?.textContent?.trim()).toBe('Eliminar');
    expect(button?.getAttribute('title')).toContain(
      'descartará la acción pendiente',
    );

    button?.click();
    fixture.detectChanges();

    expect(panel('assistant-delete-confirmation', fixture)).not.toBeNull();
    expect(
      panel('assistant-delete-warning', fixture)?.textContent,
    ).toContain('descartará la acción pendiente');
  });

  it('blocks deletion while an action is executing', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    component.input.setValue('preparar');
    component.send();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '66666666-6666-4666-8666-666666666666',
          action_type: 'CREATE_LOST_PUBLICATION',
          title: 'Registrar objeto perdido',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'executing-token',
        },
      });
    fixture.detectChanges();

    const action = component.messages().at(-1)?.pendingAction;
    component.confirmPendingAction(action!);
    component.toggleHistory();
    fixture.detectChanges();

    const row = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.history-row',
      ) as NodeListOf<HTMLElement>,
    ).find((element) => element.textContent?.includes('preparar'));
    const button = row?.querySelector(
      '[data-testid="assistant-delete-conversation"]',
    ) as HTMLButtonElement | undefined;

    expect(button?.disabled).toBe(false);
    expect(button?.getAttribute('aria-disabled')).toBe('true');
    expect(button?.classList.contains('history-delete-blocked')).toBe(
      true,
    );
    expect(button?.getAttribute('aria-describedby')).toBe(
      `assistant-delete-reason-${component.conversationId}`,
    );
    expect(
      fixture.nativeElement.querySelector(
        `#assistant-delete-reason-${component.conversationId}`,
      )?.textContent,
    ).toContain('operación en ejecución');
    expect(button?.getAttribute('title')).toContain(
      'hay una operación en ejecución',
    );

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat/confirm`)
      .flush({
        action_id: action!.action_id,
        action_type: action!.action_type,
        status: 'COMPLETED',
        result: { id: 'created' },
        message: 'Completada',
      });
  });

  it('verifies an unverified action before opening the deletion confirmation', () => {
    const source: AssistantConversation = {
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      title: 'Conversación sin verificar',
      createdAt: '2026-11-10T10:00:00.000Z',
      updatedAt: '2026-11-10T11:00:00.000Z',
      messages: [
        { role: 'user', content: 'Preparar' },
        {
          role: 'assistant',
          content: 'Acción preparada',
          pendingAction: {
            action_id: '77777777-7777-4777-8777-777777777777',
            action_type: 'CREATE_LOST_PUBLICATION',
            title: 'Registrar objeto perdido',
            fields: [],
            expires_at: '2026-11-10T12:05:00.000Z',
            status: 'UNVERIFIED',
          },
        },
      ],
    };
    TestBed.inject(AssistantConversationStorage).save([source]);
    const fixture = render();

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${source.id}/archive`,
      )
      .flush(
        { statusCode: 500, code: 'HTTP_ERROR', message: 'unavailable' },
        { status: 500, statusText: 'Server Error' },
      );
    fixture.detectChanges();
    fixture.componentInstance.toggleHistory();
    fixture.detectChanges();

    const row = Array.from(
      fixture.nativeElement.querySelectorAll(
        '.history-row',
      ) as NodeListOf<HTMLElement>,
    ).find((element) => element.textContent?.includes(source.title));
    const button = row?.querySelector(
      '[data-testid="assistant-delete-conversation"]',
    ) as HTMLButtonElement | undefined;

    expect(button?.disabled).toBe(false);
    expect(button?.textContent?.trim()).toBe('Verificar estado');
    expect(button?.getAttribute('title')).toContain(
      'hasta verificar el estado',
    );

    button?.click();
    fixture.detectChanges();
    httpMock
      .expectOne(
        (request) =>
          request.url ===
          `${environment.assistantBaseUrl}/chat/actions/77777777-7777-4777-8777-777777777777`,
      )
      .flush({
        action_id: '77777777-7777-4777-8777-777777777777',
        action_type: 'CREATE_LOST_PUBLICATION',
        status: 'SUPERSEDED',
        created_at: '2026-11-10T10:00:00.000Z',
        expires_at: '2026-11-10T10:05:00.000Z',
        result: null,
        error: null,
        result_unknown: false,
      });
    fixture.detectChanges();

    expect(panel('assistant-delete-confirmation', fixture)).not.toBeNull();
  });

  it('distinguishes a backend action conflict from an identity conflict', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    component.input.setValue('preparar');
    component.send();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply: 'Preparé la acción.',
        role: 'USER',
        pending_action: {
          action_id: '88888888-8888-4888-8888-888888888888',
          action_type: 'CREATE_LOST_PUBLICATION',
          title: 'Registrar objeto perdido',
          fields: [],
          expires_at: '2026-11-10T12:05:00.000Z',
          status: 'PENDING',
          confirmation_token: 'conflict-token',
        },
      });
    fixture.detectChanges();

    const action = component.messages().at(-1)?.pendingAction;
    const conversationId = component.conversationId;
    component.toggleHistory();
    fixture.detectChanges();

    const button = fixture.nativeElement.querySelector(
      '[data-testid="assistant-delete-conversation"]',
    ) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    panel('assistant-confirm-delete', fixture)?.click();
    fixture.detectChanges();

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
      )
      .flush(
        {
          statusCode: 409,
          code: 'CONVERSATION_ACTION_IN_PROGRESS',
          message: 'executing',
        },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(panel('assistant-delete-error', fixture)?.textContent).toContain(
      'operación en ejecución',
    );
    expect(
      component.canConfirmPendingAction(action!),
    ).toBe(true);

    const retryButton = fixture.nativeElement.querySelector(
      '[data-testid="assistant-delete-conversation"]',
    ) as HTMLButtonElement;
    retryButton.click();
    fixture.detectChanges();
    panel('assistant-confirm-delete', fixture)?.click();
    fixture.detectChanges();

    httpMock
      .expectOne(
        `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
      )
      .flush(
        {
          statusCode: 409,
          code: 'CONVERSATION_ID_CONFLICT',
          message: 'identity',
        },
        { status: 409, statusText: 'Conflict' },
      );
    fixture.detectChanges();

    expect(panel('assistant-delete-error', fixture)?.textContent).toContain(
      'otra identidad',
    );
  });

  it('shows a generic message for an unidentified validation error', () => {
    const fixture = render();
    fixture.componentInstance.send('Mensaje válido');

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush(
        {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
        },
        { status: 400, statusText: 'Bad Request' },
      );
    fixture.detectChanges();

    expect(panel('assistant-error', fixture)?.textContent).toContain(
      'La solicitud no es válida',
    );
    expect(panel('assistant-error', fixture)?.textContent).not.toContain(
      '1000 caracteres',
    );
  });

  it('loads history, opens it read-only, and continues with clean context', () => {
    const historical = historicalConversation();
    TestBed.inject(AssistantConversationStorage).save([historical]);
    const fixture = render();
    const component = fixture.componentInstance;
    const actionId =
      historical.messages[11].pendingAction!.action_id;

    flushHistorySync(historical.id, actionId);

    expect(component.conversationId).not.toBe(historical.id);
    expect(
      component.historyItems().some((item) => item.id === historical.id),
    ).toBe(true);

    component.toggleHistory();
    fixture.detectChanges();
    expect(panel('assistant-history', fixture)).not.toBeNull();

    component.selectConversation(historical.id);
    fixture.detectChanges();
    flushHistorySync(historical.id, actionId);

    expect(component.isReadOnly()).toBe(true);
    expect(panel('assistant-history-readonly', fixture)).not.toBeNull();
    expect(panel('assistant-input', fixture)).toBeNull();
    expect(panel('assistant-action-confirm', fixture)).toBeNull();
    expect(panel('assistant-action-cancel', fixture)).toBeNull();

    component.returnToCurrentConversation();
    fixture.detectChanges();
    expect(component.isReadOnly()).toBe(false);
    expect(panel('assistant-input', fixture)).not.toBeNull();

    component.selectConversation(historical.id);
    flushHistorySync(historical.id, actionId);
    component.continueSelectedConversation();
    fixture.detectChanges();

    const newConversationId = component.conversationId;
    expect(newConversationId).not.toBe(historical.id);
    expect(component.currentConversation().continuedFrom?.id).toBe(
      historical.id,
    );
    expect(
      component.historyItems().some((item) => item.id === historical.id),
    ).toBe(true);

    component.input.setValue('Mensaje de continuación');
    component.send();
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    expect(request.request.body.conversation_id).toBe(newConversationId);
    expect(request.request.body.history).toHaveLength(10);
    expect(request.request.body.history).toEqual(
      historical.messages.slice(-10).map((message) => ({
        role: message.role,
        content: message.content,
      })),
    );
    expect(JSON.stringify(request.request.body.history)).not.toContain(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    request.flush({ reply: 'Respuesta nueva', role: 'USER' });
    fixture.detectChanges();

    expect(component.historyItems().filter(
      (item) => item.id === historical.id,
    )).toHaveLength(1);
  });

  it('shares one conversation id, messages and loading state across instances', () => {
    const first = render();
    const second = render();

    const uuidPattern =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(first.componentInstance.conversationId).toMatch(uuidPattern);
    expect(second.componentInstance.conversationId).toBe(
      first.componentInstance.conversationId,
    );

    first.componentInstance.input.setValue('Hola');
    first.componentInstance.send();
    first.detectChanges();
    second.detectChanges();

    expect(first.componentInstance.loading()).toBe(true);
    expect(second.componentInstance.loading()).toBe(true);

    second.componentInstance.input.setValue('No debe enviarse');
    second.componentInstance.send();

    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    expect(request.request.body.conversation_id).toBe(
      first.componentInstance.conversationId,
    );
    expect(request.request.body.history).toEqual([]);
    request.flush({ reply: 'Respuesta', role: 'USER' });

    first.detectChanges();
    second.detectChanges();

    expect(second.componentInstance.loading()).toBe(false);
    expect(first.componentInstance.messages()).toHaveLength(2);
    expect(second.componentInstance.messages()).toHaveLength(2);
    expect(second.componentInstance.messages()).toEqual(
      first.componentInstance.messages(),
    );

    first.componentInstance.input.setValue('Otra consulta');
    first.componentInstance.send();
    const secondRequest = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat`,
    );
    expect(secondRequest.request.body.conversation_id).toBe(
      first.componentInstance.conversationId,
    );
    expect(secondRequest.request.body.history).toEqual([
      { role: 'user', content: 'Hola' },
      { role: 'assistant', content: 'Respuesta' },
    ]);
    secondRequest.flush({ reply: 'Respuesta 2', role: 'USER' });
  });

  function flushPendingAction(
    fixture: ReturnType<typeof render>,
    confirmationToken: string | null = 'test-confirmation-token',
  ) {
    fixture.componentInstance.send('Perdí una mochila');
    httpMock.expectOne(`${environment.assistantBaseUrl}/chat`).flush({
      reply: 'Preparé la publicación. Todavía no fue ejecutada.',
      role: 'USER',
      pending_action: {
        action_id: '11111111-1111-4111-8111-111111111111',
        action_type: 'CREATE_LOST_PUBLICATION',
        title: 'Registrar objeto perdido',
        fields: [
          { label: 'Título', value: 'Mochila negra' },
          { label: 'Categoría', value: 'Bolsos' },
        ],
        expires_at: '2026-11-09T17:45:00Z',
        status: 'PENDING',
        ...(confirmationToken
          ? { confirmation_token: confirmationToken }
          : {}),
      },
    });
    fixture.detectChanges();
  }

  it('renders a structured pending action with explicit controls', () => {
    const fixture = render();
    flushPendingAction(fixture);

    const card = panel('assistant-pending-action', fixture);
    expect(card?.textContent).toContain('Registrar objeto perdido');
    expect(card?.textContent).toContain('Todavía no ejecutada');
    expect(card?.textContent).toContain('Mochila negra');
    expect(card?.textContent).toContain('Bolsos');
    expect(panel('assistant-action-confirm', fixture)).not.toBeNull();
    expect(panel('assistant-action-cancel', fixture)).not.toBeNull();
    expect(localStorage.length).toBe(1);
  });

  it('does not enable confirmation without a confirmation token', () => {
    const fixture = render();
    flushPendingAction(fixture, null);

    const confirmButton = panel(
      'assistant-action-confirm',
      fixture,
    ) as HTMLButtonElement | null;
    expect(confirmButton).not.toBeNull();
    expect(confirmButton?.disabled).toBe(true);
  });

  it('archives the current conversation and discards confirmation capability when leaving it', () => {
    const fixture = render();
    flushPendingAction(fixture);
    const conversationId = fixture.componentInstance.conversationId;
    const action = fixture.componentInstance.messages().at(-1)?.pendingAction;
    expect(action).toBeDefined();

    fixture.componentInstance.selectConversation(conversationId);
    const archive = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/conversations/${conversationId}/archive`,
    );
    archive.flush({
      conversation_id: conversationId,
      archived: true,
      superseded: 1,
    });
    fixture.detectChanges();

    const archivedAction = fixture.componentInstance
      .messages()
      .at(-1)?.pendingAction;
    expect(archivedAction?.status).toBe('SUPERSEDED');
    expect(panel('assistant-action-confirm', fixture)).toBeNull();
  });

  it('shares pending actions and confirmation results across instances', () => {
    const first = render();
    const second = render();
    flushPendingAction(first);
    first.detectChanges();
    second.detectChanges();

    const action = second.componentInstance.messages().at(-1)?.pendingAction;
    expect(action).toBeDefined();
    expect(panel('assistant-pending-action', second)).not.toBeNull();

    second.componentInstance.confirmPendingAction(action!);

    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/confirm`,
    );
    expect(request.request.body.conversation_id).toBe(
      first.componentInstance.conversationId,
    );
    request.flush({
      action_id: '11111111-1111-4111-8111-111111111111',
      action_type: 'CREATE_LOST_PUBLICATION',
      status: 'COMPLETED',
      result: { id: '22222222-2222-4222-8222-222222222222' },
      message: 'ok',
    });
    first.detectChanges();
    second.detectChanges();

    expect(panel('assistant-pending-action', first)?.textContent).toContain(
      'Completada',
    );
    expect(panel('assistant-pending-action', second)?.textContent).toContain(
      'Completada',
    );
    expect(panel('assistant-action-confirm', first)).toBeNull();
    expect(panel('assistant-action-confirm', second)).toBeNull();
  });

  it('prevents duplicate confirmation requests', () => {
    const fixture = render();
    flushPendingAction(fixture);
    const action = fixture.componentInstance.messages().at(-1)?.pendingAction;
    expect(action).toBeDefined();

    fixture.componentInstance.confirmPendingAction(action!);
    fixture.componentInstance.confirmPendingAction(action!);

    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/confirm`,
    );
    request.flush({
      action_id: '11111111-1111-4111-8111-111111111111',
      action_type: 'CREATE_LOST_PUBLICATION',
      status: 'COMPLETED',
      result: { id: '22222222-2222-4222-8222-222222222222' },
      message: 'ok',
    });
    fixture.detectChanges();
  });

  it('confirms an action and shows the real result link', () => {
    const fixture = render();
    flushPendingAction(fixture);

    panel('assistant-action-confirm', fixture)?.click();
    fixture.detectChanges();

    expect(panel('assistant-action-confirm', fixture)).toBeNull();
    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/confirm`,
    );
    expect(request.request.body).toEqual({
      conversation_id: fixture.componentInstance.conversationId,
      action_id: '11111111-1111-4111-8111-111111111111',
      confirmation_token: 'test-confirmation-token',
    });
    request.flush({
      action_id: '11111111-1111-4111-8111-111111111111',
      action_type: 'CREATE_LOST_PUBLICATION',
      status: 'COMPLETED',
      result: {
        id: '22222222-2222-4222-8222-222222222222',
        type: 'LOST',
        status: 'ACTIVE',
        title: 'Mochila negra',
      },
      message: 'La operación se completó correctamente.',
    });
    fixture.detectChanges();

    const card = panel('assistant-pending-action', fixture);
    expect(card?.textContent).toContain('Completada');
    expect(card?.textContent).toContain('Mochila negra');
    expect(
      card?.querySelector('a')?.getAttribute('href'),
    ).toBe('/publications/22222222-2222-4222-8222-222222222222');
    expect(panel('assistant-action-confirm', fixture)).toBeNull();
  });

  it('cancels a pending action', () => {
    const fixture = render();
    flushPendingAction(fixture);

    panel('assistant-action-cancel', fixture)?.click();
    fixture.detectChanges();

    const request = httpMock.expectOne(
      `${environment.assistantBaseUrl}/chat/cancel`,
    );
    expect(request.request.body).toEqual({
      conversation_id: fixture.componentInstance.conversationId,
      action_id: '11111111-1111-4111-8111-111111111111',
    });
    request.flush({
      action_id: '11111111-1111-4111-8111-111111111111',
      status: 'CANCELLED',
      message: 'La acción fue cancelada.',
    });
    fixture.detectChanges();

    const card = panel('assistant-pending-action', fixture);
    expect(card?.textContent).toContain('Cancelada');
    expect(panel('assistant-action-confirm', fixture)).toBeNull();
    expect(panel('assistant-action-cancel', fixture)).toBeNull();
  });

  it('shows an unknown execution result without retry controls', () => {
    const fixture = render();
    flushPendingAction(fixture);

    panel('assistant-action-confirm', fixture)?.click();
    fixture.detectChanges();
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat/confirm`)
      .flush(
        {
          statusCode: 504,
          code: 'ACTION_RESULT_UNKNOWN',
          message: 'unknown result',
        },
        { status: 504, statusText: 'Gateway Timeout' },
      );
    fixture.detectChanges();

    const card = panel('assistant-pending-action', fixture);
    expect(card?.textContent).toContain('Verificá si la operación se realizó');
    expect(panel('assistant-action-confirm', fixture)).toBeNull();
    expect(panel('assistant-action-cancel', fixture)).toBeNull();
  });

  it('shows an admin role returned by the backend', () => {
    const fixture = render();
    fixture.componentInstance.send('¿Qué puede hacer un administrador?');

    const request = httpMock.expectOne(`${environment.assistantBaseUrl}/chat`);
    request.flush({
      reply: 'Como administrador, podés orientar sobre moderación.',
      role: 'ADMIN',
    });
    fixture.detectChanges();

    expect(panel('assistant-conversation', fixture)?.textContent).toContain(
      'Administrador',
    );
  });

  it('shows a connection error without losing the conversation', () => {
    const fixture = render();
    fixture.componentInstance.send('Hola');

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush(
        new ErrorEvent('NetworkError'),
        { status: 0, statusText: 'Unknown Error' },
      );
    fixture.detectChanges();

    expect(panel('assistant-error', fixture)?.textContent).toContain(
      'No se pudo conectar',
    );
    expect(panel('assistant-conversation', fixture)?.textContent).toContain(
      'Hola',
    );
  });

  it('keeps working in memory when localStorage cannot save', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const fixture = render();

    fixture.componentInstance.send('Mensaje sin persistencia');
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta en memoria', role: 'USER' });
    fixture.detectChanges();

    expect(
      panel('assistant-conversation', fixture)?.textContent,
    ).toContain('Mensaje sin persistencia');
    expect(
      panel('assistant-conversation', fixture)?.textContent,
    ).toContain('Respuesta en memoria');
  });

  it('renders escaped Markdown and escapes HTML', () => {
    const fixture = render();
    fixture.componentInstance.send('Mostrame formato');

    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({
        reply:
          '\\*\\*Buscar\\*\\*\n\n1. Uno\n2. Dos\n\n- A\n- B\n\nPrimera línea\nSegunda línea\n\n<img src=x onerror="alert(1)"> **Seguro**',
        role: 'USER',
      });
    fixture.detectChanges();

    const conversation = panel('assistant-conversation', fixture);
    const assistantContent = conversation?.querySelector(
      '.message-assistant .message-content',
    );
    const strongs = Array.from(
      assistantContent?.querySelectorAll('strong') ?? [],
    ).map((element) => element.textContent);

    expect(strongs).toEqual(['Buscar', 'Seguro']);
    expect(assistantContent?.querySelector('ol')?.children.length).toBe(2);
    expect(assistantContent?.querySelector('ul')?.children.length).toBe(2);
    expect(assistantContent?.querySelector('br')).not.toBeNull();
    expect(assistantContent?.innerHTML).not.toContain('\\*\\*');
    expect(assistantContent?.querySelector('img')).toBeNull();
    expect(assistantContent?.textContent).toContain('<img');
  });

  it('sends with Enter and respects modifier keys and IME', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    component.input.setValue('Enviar con Enter');
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    component.onKeydown(enter);
    expect(enter.defaultPrevented).toBe(true);
    httpMock
      .expectOne(`${environment.assistantBaseUrl}/chat`)
      .flush({ reply: 'Respuesta', role: 'USER' });
    fixture.detectChanges();

    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      component.input.setValue('Nueva línea');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
        [modifier]: true,
      });
      component.onKeydown(event);
      expect(event.defaultPrevented).toBe(false);
    }
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat`);

    component.input.setValue('Composición');
    const composing = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    Object.defineProperty(composing, 'isComposing', { value: true });
    component.onKeydown(composing);
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat`);
  });

  it('does not send empty messages or duplicate submissions while loading', () => {
    const fixture = render();
    const component = fixture.componentInstance;

    component.input.setValue('   ');
    component.onKeydown(
      new KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat`);

    component.input.setValue('Mensaje válido');
    component.loading.set(true);
    component.send();
    httpMock.expectNone(`${environment.assistantBaseUrl}/chat`);
  });
});
