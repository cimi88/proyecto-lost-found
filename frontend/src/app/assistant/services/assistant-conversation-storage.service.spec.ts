import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  DEMO_USER_A_ID,
  DEMO_USER_B_ID,
  DemoSessionService,
} from '../../core/demo-session.service';
import type { AssistantConversation } from '../models/assistant.models';
import {
  ASSISTANT_CONVERSATION_SCHEMA_VERSION,
  AssistantConversationStorage,
} from './assistant-conversation-storage.service';

function conversation(
  id: string,
  updatedAt = '2026-11-09T12:00:00.000Z',
): AssistantConversation {
  return {
    id,
    title: `Conversación ${id}`,
    createdAt: '2026-11-09T11:00:00.000Z',
    updatedAt,
    messages: [
      { role: 'user', content: `Mensaje ${id}` },
      { role: 'assistant', content: `Respuesta ${id}` },
    ],
  };
}

describe('AssistantConversationStorage', () => {
  let storage: AssistantConversationStorage;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    storage = TestBed.inject(AssistantConversationStorage);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('round-trips conversations with the schema version', () => {
    const items = [conversation('one'), conversation('two')];

    expect(storage.save(items)).toBe(true);
    expect(storage.load()).toEqual(items);

    const raw = JSON.parse(localStorage.getItem(storage.storageKey) ?? '{}');
    expect(raw.schemaVersion).toBe(ASSISTANT_CONVERSATION_SCHEMA_VERSION);
    expect(raw.conversations).toEqual(items);
  });

  it('persists the action id but never the confirmation token', () => {
    const item = conversation('action');
    item.messages[1] = {
      role: 'assistant',
      content: 'Vista previa',
      pendingAction: {
        action_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        action_type: 'CREATE_LOST_PUBLICATION',
        title: 'Publicar',
        fields: [{ label: 'Título', value: 'Mochila' }],
        expires_at: '2026-11-09T17:45:00Z',
        status: 'PENDING',
        confirmation_token: 'super-secret-token',
      },
    };

    storage.save([item]);

    const loaded = storage.load();
    expect(loaded[0].messages[1].pendingAction?.action_id).toBe(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(loaded[0].messages[1].pendingAction?.confirmation_token).toBe(
      undefined,
    );
    expect(localStorage.getItem(storage.storageKey)).not.toContain(
      'super-secret-token',
    );
    expect(loaded[0].messages[1].content).toBe('Vista previa');
  });

  it('ignores corrupt JSON without throwing', () => {
    localStorage.setItem(storage.storageKey, '{not-json');

    expect(storage.load()).toEqual([]);
  });

  it('ignores an incompatible schema version', () => {
    localStorage.setItem(
      storage.storageKey,
      JSON.stringify({
        schemaVersion: ASSISTANT_CONVERSATION_SCHEMA_VERSION + 1,
        conversations: [conversation('future')],
      }),
    );

    expect(storage.load()).toEqual([]);
  });

  it('preserves every stored conversation', () => {
    const items = Array.from({ length: 51 }, (_, index) =>
      conversation(String(index).padStart(2, '0')),
    );
    storage.save(items);

    expect(storage.load()).toHaveLength(51);
  });

  it('tracks pending local deletion markers separately from conversations', () => {
    storage.markPendingDeletion('conversation-one');
    storage.markPendingDeletion('conversation-two');

    expect(storage.loadPendingDeletions()).toEqual([
      'conversation-one',
      'conversation-two',
    ]);

    storage.clearPendingDeletion('conversation-one');
    expect(storage.loadPendingDeletions()).toEqual(['conversation-two']);
  });

  it('reports a failed save without throwing when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(storage.save([conversation('one')])).toBe(false);
  });

  it('isolates stored assistant history by active demo identity', () => {
    const session = TestBed.inject(DemoSessionService);
    const aConversation = conversation('identity-a');
    const bConversation = conversation('identity-b');

    session.select(DEMO_USER_A_ID);
    const keyA = storage.storageKey;
    storage.save([aConversation]);

    session.select(DEMO_USER_B_ID);
    const keyB = storage.storageKey;
    expect(keyB).not.toBe(keyA);
    expect(storage.load()).toEqual([]);

    storage.save([bConversation]);
    expect(storage.load()).toEqual([bConversation]);

    session.select(DEMO_USER_A_ID);
    expect(storage.load()).toEqual([aConversation]);
  });
});
