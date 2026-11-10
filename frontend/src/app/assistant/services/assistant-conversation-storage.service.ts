import { Injectable, inject } from '@angular/core';
import { DemoSessionService } from '../../core/demo-session.service';
import type {
  AssistantConversation,
  AssistantDisplayMessage,
} from '../models/assistant.models';

export const ASSISTANT_CONVERSATION_SCHEMA_VERSION = 1;

interface StoredConversationEnvelope {
  schemaVersion: number;
  conversations: AssistantConversation[];
}

@Injectable({ providedIn: 'root' })
export class AssistantConversationStorage {
  private readonly session = inject(DemoSessionService);

  get storageKey(): string {
    const userId = this.session.activeProfile()?.id ?? 'anonymous';
    return `lostfound.assistant.conversations.v${ASSISTANT_CONVERSATION_SCHEMA_VERSION}.${userId}`;
  }

  get pendingDeletionsKey(): string {
    const userId = this.session.activeProfile()?.id ?? 'anonymous';
    return `lostfound.assistant.pending-deletions.v${ASSISTANT_CONVERSATION_SCHEMA_VERSION}.${userId}`;
  }

  loadPendingDeletions(): string[] {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const raw = window.sessionStorage.getItem(this.pendingDeletionsKey);
      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return [
        ...new Set(
          parsed.filter(
            (value): value is string =>
              typeof value === 'string' && value.length > 0,
          ),
        ),
      ];
    } catch {
      return [];
    }
  }

  markPendingDeletion(conversationId: string): boolean {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const pending = new Set(this.loadPendingDeletions());
      pending.add(conversationId);
      window.sessionStorage.setItem(
        this.pendingDeletionsKey,
        JSON.stringify([...pending]),
      );
      return true;
    } catch {
      return false;
    }
  }

  clearPendingDeletion(conversationId: string): boolean {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const pending = this.loadPendingDeletions().filter(
        (id) => id !== conversationId,
      );
      if (pending.length === 0) {
        window.sessionStorage.removeItem(this.pendingDeletionsKey);
      } else {
        window.sessionStorage.setItem(
          this.pendingDeletionsKey,
          JSON.stringify(pending),
        );
      }
      return true;
    } catch {
      return false;
    }
  }

  load(): AssistantConversation[] {
    try {
      if (typeof window === 'undefined') {
        return [];
      }

      const raw = window.localStorage.getItem(this.storageKey);
      if (!raw) {
        return [];
      }

      const parsed: unknown = JSON.parse(raw);
      if (!this.isEnvelope(parsed)) {
        return [];
      }

      return parsed.conversations
        .filter((conversation) => this.isConversation(conversation))
        .map((conversation) =>
          this.withoutConfirmationCapability(conversation),
        );
    } catch {
      return [];
    }
  }

  save(conversations: AssistantConversation[]): boolean {
    try {
      if (typeof window === 'undefined') {
        return false;
      }

      const envelope: StoredConversationEnvelope = {
        schemaVersion: ASSISTANT_CONVERSATION_SCHEMA_VERSION,
        conversations: conversations.map((conversation) =>
          this.withoutConfirmationCapability(conversation),
        ),
      };
      window.localStorage.setItem(
        this.storageKey,
        JSON.stringify(envelope),
      );
      return true;
    } catch {
      return false;
    }
  }

  private withoutConfirmationCapability(
    conversation: AssistantConversation,
  ): AssistantConversation {
    return {
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.pendingAction
          ? {
              ...message,
              pendingAction: {
                ...message.pendingAction,
                confirmation_token: undefined,
              },
            }
          : message,
      ),
    };
  }

  private isEnvelope(value: unknown): value is StoredConversationEnvelope {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<StoredConversationEnvelope>;
    return (
      candidate.schemaVersion === ASSISTANT_CONVERSATION_SCHEMA_VERSION &&
      Array.isArray(candidate.conversations)
    );
  }

  private isConversation(value: unknown): value is AssistantConversation {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<AssistantConversation>;
    return (
      typeof candidate.id === 'string' &&
      candidate.id.length > 0 &&
      typeof candidate.title === 'string' &&
      typeof candidate.createdAt === 'string' &&
      typeof candidate.updatedAt === 'string' &&
      Array.isArray(candidate.messages) &&
      candidate.messages.every((message) => this.isMessage(message))
    );
  }

  private isMessage(value: unknown): value is AssistantDisplayMessage {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const candidate = value as Partial<AssistantDisplayMessage>;
    return (
      (candidate.role === 'user' || candidate.role === 'assistant') &&
      typeof candidate.content === 'string'
    );
  }
}
