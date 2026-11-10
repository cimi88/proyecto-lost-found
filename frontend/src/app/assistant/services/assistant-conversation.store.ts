import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  Observable,
  catchError,
  finalize,
  forkJoin,
  map,
  of,
} from 'rxjs';
import type {
  AssistantActionStatusResponse,
  AssistantChatMessage,
  AssistantConversation,
  AssistantDisplayMessage,
  AssistantError,
  AssistantPendingAction,
  AssistantRole,
} from '../models/assistant.models';
import { AssistantConversationStorage } from './assistant-conversation-storage.service';
import { AssistantService } from './assistant.service';

const MAX_CONTEXT_MESSAGES = 10;
const MAX_CONTEXT_CHARS = 2000;
const MAX_TITLE_LENGTH = 60;

@Injectable({ providedIn: 'root' })
export class AssistantConversationStore {
  private readonly assistant = inject(AssistantService);
  private readonly storage = inject(AssistantConversationStorage);

  private readonly current = signal<AssistantConversation>(
    this.createConversation(),
  );
  private readonly archived = signal<AssistantConversation[]>(
    this.storage.load(),
  );
  private readonly selectedId = signal<string | null>(null);

  private seedHistory: AssistantChatMessage[] | null = null;
  private lastPersistedSnapshot = '';
  private readonly confirmationTokens = new Map<string, string>();
  private readonly remotelyArchived = signal<Set<string>>(new Set());

  readonly loading = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly actionInProgress = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly deleteInProgress = signal<string | null>(null);
  readonly deleteVerificationInProgress = signal<string | null>(null);
  readonly deleteError = signal<string | null>(null);
  readonly storageError = signal<string | null>(null);

  readonly currentConversation = this.current.asReadonly();
  readonly currentConversationId = computed(() => this.current().id);
  readonly conversations = computed<AssistantConversation[]>(() => {
    const current = this.current();
    const items =
      current.messages.length > 0
        ? [current, ...this.archived()]
        : [...this.archived()];

    return items.sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt),
    );
  });
  readonly selectedConversation = computed<AssistantConversation | null>(
    () => {
      const selectedId = this.selectedId();
      if (!selectedId || selectedId === this.current().id) {
        return null;
      }

      return this.archived().find((item) => item.id === selectedId) ?? null;
    },
  );
  readonly viewedConversation = computed(
    () => this.selectedConversation() ?? this.current(),
  );
  readonly messages = computed(() => this.viewedConversation().messages);
  readonly isReadOnly = computed(
    () => this.selectedConversation() !== null,
  );

  constructor() {
    this.retryPendingLocalDeletions();
    this.reconcileArchivedConversations();
  }

  resetForIdentityChange(): void {
    this.current.set(this.createConversation());
    this.archived.set(this.storage.load());
    this.selectedId.set(null);
    this.seedHistory = null;
    this.lastPersistedSnapshot = '';
    this.confirmationTokens.clear();
    this.remotelyArchived.set(new Set());
    this.loading.set(false);
    this.errorMessage.set(null);
    this.actionInProgress.set(null);
    this.actionError.set(null);
    this.deleteInProgress.set(null);
    this.deleteVerificationInProgress.set(null);
    this.deleteError.set(null);
    this.storageError.set(null);

    this.retryPendingLocalDeletions();
    this.reconcileArchivedConversations();
  }

  get conversationId(): string {
    return this.current().id;
  }

  send(message: string): void {
    if (
      this.loading() ||
      this.isReadOnly() ||
      this.deleteInProgress()
    ) {
      return;
    }

    if (this.remotelyArchived().has(this.current().id)) {
      this.errorMessage.set(
        'Esta conversación ya fue archivada en el servidor. Reintentá la limpieza local antes de continuar.',
      );
      return;
    }

    const current = this.current();
    const history =
      this.seedHistory ?? this.buildModelContext(current.messages);
    const now = new Date().toISOString();

    this.errorMessage.set(null);
    this.current.update((conversation) => ({
      ...conversation,
      title:
        conversation.title ||
        this.titleFromMessage(message),
      updatedAt: now,
      messages: [
        ...conversation.messages,
        { role: 'user', content: message },
      ],
    }));
    this.persist();
    this.loading.set(true);

    const conversationId = current.id;
    this.assistant.chat(message, history, conversationId).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.actionError.set(null);
        const active = this.current();
        if (active.id !== conversationId) {
          return;
        }

        const pendingAction = response.pending_action;
        let displayAction: AssistantPendingAction | undefined;
        if (pendingAction) {
          const { confirmation_token, ...action } = pendingAction;
          this.confirmationTokens.clear();
          if (confirmation_token) {
            this.confirmationTokens.set(
              action.action_id,
              confirmation_token,
            );
          }
          displayAction = action;
        }

        const previousMessages = pendingAction
          ? active.messages.map((item) =>
              item.pendingAction
                ? { ...item, pendingAction: undefined }
                : item,
            )
          : active.messages;

        this.current.set({
          ...active,
          updatedAt: new Date().toISOString(),
          messages: [
            ...previousMessages,
            {
              role: 'assistant',
              content: response.reply,
              roleLabel: this.roleLabel(response.role),
              pendingAction: displayAction,
            },
          ],
        });
        this.seedHistory = null;
        this.persist();
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.errorMessage.set(this.describeError(error));
      },
    });
  }

  canConfirmPendingAction(action: AssistantPendingAction): boolean {
    return (
      !this.isReadOnly() &&
      !this.remotelyArchived().has(this.current().id) &&
      action.status === 'PENDING' &&
      !this.actionInProgress() &&
      this.confirmationTokens.has(action.action_id)
    );
  }

  confirmPendingAction(action: AssistantPendingAction): void {
    if (
      this.isReadOnly() ||
      this.remotelyArchived().has(this.current().id) ||
      action.status !== 'PENDING' ||
      this.actionInProgress() ||
      this.deleteInProgress()
    ) {
      return;
    }

    const confirmationToken = this.confirmationTokens.get(action.action_id);
    if (!confirmationToken) {
      this.actionError.set(
        'La capacidad de confirmación ya no está disponible. Prepará la acción nuevamente.',
      );
      return;
    }

    this.actionInProgress.set(action.action_id);
    this.actionError.set(null);
    this.confirmationTokens.delete(action.action_id);
    this.updatePendingAction(action.action_id, {
      ...action,
      status: 'EXECUTING',
      errorCode: undefined,
      errorMessage: undefined,
    });

    this.assistant
      .confirmAction(
        this.conversationId,
        action.action_id,
        confirmationToken,
      )
      .subscribe({
        next: (response) => {
          this.actionInProgress.set(null);
          this.updatePendingAction(action.action_id, {
            ...action,
            status: 'COMPLETED',
            result: response.result,
            errorCode: undefined,
            errorMessage: undefined,
          });
        },
        error: (error: unknown) => {
          this.actionInProgress.set(null);
          const code = this.actionErrorCode(error);
          const message = this.describeActionError(error);
          this.actionError.set(message);
          this.updatePendingAction(action.action_id, {
            ...action,
            status:
              code === 'ACTION_ALREADY_EXECUTING'
                ? 'EXECUTING'
                : 'FAILED',
            errorCode: code ?? undefined,
            errorMessage: message,
          });
        },
      });
  }

  cancelPendingAction(action: AssistantPendingAction): void {
    if (
      this.isReadOnly() ||
      this.remotelyArchived().has(this.current().id) ||
      action.status !== 'PENDING' ||
      this.actionInProgress() ||
      this.deleteInProgress()
    ) {
      return;
    }

    this.actionInProgress.set(action.action_id);
    this.actionError.set(null);
    this.confirmationTokens.delete(action.action_id);

    this.assistant
      .cancelAction(this.conversationId, action.action_id)
      .subscribe({
        next: () => {
          this.actionInProgress.set(null);
          this.updatePendingAction(action.action_id, {
            ...action,
            status: 'CANCELLED',
            errorCode: undefined,
            errorMessage: undefined,
          });
        },
        error: (error: unknown) => {
          this.actionInProgress.set(null);
          this.actionError.set(this.describeActionError(error));
        },
      });
  }

  deleteBlockReason(conversation: AssistantConversation): string | null {
    const kind = this.deleteBlockKind(conversation);
    if (kind === 'EXECUTING') {
      return 'No se puede eliminar: hay una operación en ejecución.';
    }
    if (kind === 'ACTION_RESULT_UNKNOWN') {
      return 'No se puede eliminar: todavía no se pudo verificar el resultado de una operación.';
    }
    if (kind === 'UNVERIFIED') {
      return 'No se puede eliminar hasta verificar el estado de la operación.';
    }

    return null;
  }

  deleteWarning(conversation: AssistantConversation): string | null {
    return this.actionsFor(conversation).some(
      (action) => action.status === 'PENDING',
    )
      ? 'Eliminar este chat descartará la acción pendiente de confirmación.'
      : null;
  }

  deleteRequiresVerification(
    conversation: AssistantConversation,
  ): boolean {
    return this.deleteBlockKind(conversation) === 'UNVERIFIED';
  }

  canDeleteConversation(conversation: AssistantConversation): boolean {
    return this.deleteBlockKind(conversation) === null;
  }

  isRemotelyArchived(conversationId: string): boolean {
    return this.remotelyArchived().has(conversationId);
  }

  verifyConversationForDeletion(
    conversationId: string,
  ): Observable<boolean> {
    const target = this.findConversation(conversationId);
    if (!target) {
      return of(false);
    }

    const unverified = this.actionsFor(target).filter(
      (action) => action.status === 'UNVERIFIED',
    );
    if (unverified.length === 0) {
      return of(this.canDeleteConversation(target));
    }

    this.deleteVerificationInProgress.set(conversationId);
    this.deleteError.set(null);

    return forkJoin(
      unverified.map((action) =>
        this.assistant
          .getActionStatus(conversationId, action.action_id)
          .pipe(
            map((status) => ({
              actionId: action.action_id,
              status,
            })),
            catchError(() => {
              this.markActionUnverified(
                conversationId,
                action.action_id,
              );
              return of(null);
            }),
          ),
      ),
    ).pipe(
      map((results) => {
        for (const result of results) {
          if (!result) {
            continue;
          }

          this.applyBackendStatus(
            conversationId,
            result.actionId,
            result.status,
          );
        }

        const updated = this.findConversation(conversationId);
        if (!updated) {
          return false;
        }

        const allowed = this.canDeleteConversation(updated);
        if (!allowed) {
          this.deleteError.set(
            this.deleteBlockReason(updated) ??
              'No se pudo verificar el estado de la operación.',
          );
        }
        return allowed;
      }),
      catchError(() => {
        this.deleteError.set(
          'No se pudo verificar el estado de la operación con el servidor.',
        );
        return of(false);
      }),
      finalize(() => {
        this.deleteVerificationInProgress.set(null);
      }),
    );
  }

  deleteConversation(id: string): void {
    if (
      this.loading() ||
      this.actionInProgress() ||
      this.deleteInProgress() ||
      this.deleteVerificationInProgress()
    ) {
      return;
    }

    const target = this.findConversation(id);
    if (!target) {
      return;
    }

    if (this.remotelyArchived().has(id)) {
      this.deleteInProgress.set(id);
      this.deleteError.set(null);
      const finalized = this.finalizeLocalDeletion(target);
      this.deleteInProgress.set(null);
      if (!finalized) {
        this.deleteError.set(
          'El chat ya fue archivado en el servidor, pero no pudo actualizarse el historial local. Reintentá la limpieza local.',
        );
      }
      return;
    }

    if (!this.canDeleteConversation(target)) {
      this.deleteError.set(
        this.deleteBlockReason(target) ??
          'No se puede eliminar esta conversación.',
      );
      return;
    }

    this.deleteInProgress.set(id);
    this.deleteError.set(null);

    this.assistant.archiveConversation(id).subscribe({
      next: () => {
        this.remotelyArchived.update((ids) => {
          const updated = new Set(ids);
          updated.add(id);
          return updated;
        });
        this.storage.markPendingDeletion(id);

        const finalized = this.finalizeLocalDeletion(target);
        this.deleteInProgress.set(null);
        if (finalized) {
          this.deleteError.set(null);
        } else {
          this.deleteError.set(
            'El chat fue archivado en el servidor, pero no pudo actualizarse el historial local. Se conserva para reintentar la limpieza local.',
          );
        }
      },
      error: (error: unknown) => {
        this.deleteInProgress.set(null);
        this.deleteError.set(this.describeDeleteError(error));
      },
    });
  }

  selectConversation(id: string): void {
    if (
      this.loading() ||
      this.actionInProgress() ||
      this.deleteInProgress() ||
      this.rejectWhenCurrentRemotelyArchived()
    ) {
      return;
    }

    this.confirmationTokens.clear();
    this.archiveCurrentBackend();

    if (id === this.current().id) {
      this.selectedId.set(null);
      return;
    }

    const historical = this.archived().find(
      (conversation) => conversation.id === id,
    );
    if (historical) {
      this.selectedId.set(id);
      this.reconcileConversation(historical);
    }
  }

  returnToCurrentConversation(): void {
    if (this.rejectWhenCurrentRemotelyArchived()) {
      return;
    }

    this.confirmationTokens.clear();
    this.selectedId.set(null);
  }

  startNewConversation(): void {
    if (
      this.loading() ||
      this.actionInProgress() ||
      this.deleteInProgress() ||
      this.rejectWhenCurrentRemotelyArchived()
    ) {
      return;
    }

    this.archiveCurrent();
  }

  continueConversation(id: string): void {
    if (
      this.loading() ||
      this.actionInProgress() ||
      this.deleteInProgress() ||
      this.rejectWhenCurrentRemotelyArchived()
    ) {
      return;
    }

    const source = this.archived().find(
      (conversation) => conversation.id === id,
    );
    if (!source) {
      return;
    }

    this.archiveCurrent();
    this.seedHistory = this.buildModelContext(source.messages);
    this.current.set({
      ...this.createConversation(),
      continuedFrom: {
        id: source.id,
        title: source.title,
        createdAt: source.createdAt,
      },
    });
    this.persist();
  }

  private createConversation(): AssistantConversation {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      title: '',
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
  }

  private archiveCurrent(): void {
    const current = this.current();
    this.archiveCurrentBackend();
    this.confirmationTokens.clear();
    if (current.messages.length > 0) {
      this.archived.update((items) => [
        current,
        ...items.filter((item) => item.id !== current.id),
      ]);
    }

    this.current.set(this.createConversation());
    this.selectedId.set(null);
    this.seedHistory = null;
    this.persist();
  }

  private reconcileArchivedConversations(): void {
    for (const conversation of this.archived()) {
      if (this.remotelyArchived().has(conversation.id)) {
        continue;
      }
      this.reconcileConversation(conversation);
    }
  }

  private findConversation(id: string): AssistantConversation | undefined {
    if (this.current().id === id) {
      return this.current();
    }

    return this.archived().find(
      (conversation) => conversation.id === id,
    );
  }

  private rejectWhenCurrentRemotelyArchived(): boolean {
    if (!this.remotelyArchived().has(this.current().id)) {
      return false;
    }

    this.deleteError.set(
      'Esta conversación fue archivada en el servidor. Reintentá la limpieza local antes de cambiar de conversación.',
    );
    return true;
  }

  private deleteBlockKind(
    conversation: AssistantConversation,
  ): 'EXECUTING' | 'ACTION_RESULT_UNKNOWN' | 'UNVERIFIED' | null {
    let unverified = false;

    for (const action of this.actionsFor(conversation)) {
      if (action.status === 'EXECUTING') {
        return 'EXECUTING';
      }
      if (
        action.status === 'FAILED' &&
        action.errorCode === 'ACTION_RESULT_UNKNOWN'
      ) {
        return 'ACTION_RESULT_UNKNOWN';
      }
      if (action.status === 'UNVERIFIED') {
        unverified = true;
      }
    }

    return unverified ? 'UNVERIFIED' : null;
  }

  private storedConversations(excludeId?: string): AssistantConversation[] {
    const current = this.current();
    return [
      ...(current.id !== excludeId && current.messages.length > 0
        ? [current]
        : []),
      ...this.archived().filter(
        (conversation) => conversation.id !== excludeId,
      ),
    ]
      .filter(
        (conversation, index, items) =>
          items.findIndex((item) => item.id === conversation.id) === index,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  private finalizeLocalDeletion(
    target: AssistantConversation,
  ): boolean {
    const stored = this.storedConversations(target.id);
    if (!this.storage.save(stored)) {
      this.storageError.set(
        'El chat fue archivado en el servidor, pero no pudo actualizarse el historial local. Se conserva para reintentar la limpieza local.',
      );
      return false;
    }

    this.lastPersistedSnapshot = JSON.stringify(stored);
    this.storageError.set(null);

    for (const action of this.actionsFor(target)) {
      this.confirmationTokens.delete(action.action_id);
    }

    if (target.id === this.current().id) {
      this.current.set(this.createConversation());
      this.selectedId.set(null);
      this.seedHistory = null;
    } else {
      this.archived.update((items) =>
        items.filter((conversation) => conversation.id !== target.id),
      );
      if (this.selectedId() === target.id) {
        this.selectedId.set(null);
      }
    }

    this.remotelyArchived.update((ids) => {
      const updated = new Set(ids);
      updated.delete(target.id);
      return updated;
    });
    this.storage.clearPendingDeletion(target.id);
    return true;
  }

  private retryPendingLocalDeletions(): void {
    const pending = this.storage.loadPendingDeletions();
    if (pending.length === 0) {
      return;
    }

    this.remotelyArchived.set(new Set(pending));
    for (const conversationId of pending) {
      const target = this.findConversation(conversationId);
      if (!target) {
        this.storage.clearPendingDeletion(conversationId);
        this.remotelyArchived.update((ids) => {
          const updated = new Set(ids);
          updated.delete(conversationId);
          return updated;
        });
        continue;
      }

      if (!this.finalizeLocalDeletion(target)) {
        return;
      }
    }
  }

  private reconcileConversation(conversation: AssistantConversation): void {
    const actions = conversation.messages
      .map((message) => message.pendingAction)
      .filter((action): action is AssistantPendingAction => !!action);

    if (actions.length === 0) {
      return;
    }

    this.assistant.archiveConversation(conversation.id).subscribe({
      next: () => {
        for (const action of actions) {
          this.refreshActionStatus(conversation.id, action);
        }
      },
      error: () => {
        for (const action of actions) {
          this.markActionUnverified(conversation.id, action.action_id);
        }
      },
    });
  }

  private refreshActionStatus(
    conversationId: string,
    action: AssistantPendingAction,
  ): void {
    if (!action.action_id) {
      this.markActionUnverified(conversationId, action.action_id);
      return;
    }

    this.assistant
      .getActionStatus(conversationId, action.action_id)
      .subscribe({
        next: (status) => {
          this.applyBackendStatus(
            conversationId,
            action.action_id,
            status,
          );
        },
        error: () => {
          this.markActionUnverified(conversationId, action.action_id);
        },
      });
  }

  private applyBackendStatus(
    conversationId: string,
    actionId: string,
    status: AssistantActionStatusResponse,
  ): void {
    this.updateActionInConversation(conversationId, actionId, (action) => ({
      ...action,
      status: status.status,
      result: status.result ?? action.result,
      errorCode: status.result_unknown
        ? 'ACTION_RESULT_UNKNOWN'
        : undefined,
      errorMessage: status.result_unknown
        ? 'No se pudo confirmar el resultado. Verificá si la operación se realizó antes de intentar crear otra.'
        : status.error ?? undefined,
    }));
  }

  private markActionUnverified(
    conversationId: string,
    actionId: string,
  ): void {
    this.updateActionInConversation(conversationId, actionId, (action) => ({
      ...action,
      status: 'UNVERIFIED',
      errorCode: 'ACTION_STATUS_UNAVAILABLE',
      errorMessage:
        'No se pudo verificar el estado de esta acción con el servidor.',
    }));
  }

  private updateActionInConversation(
    conversationId: string,
    actionId: string,
    update: (action: AssistantPendingAction) => AssistantPendingAction,
  ): void {
    if (this.current().id === conversationId) {
      this.current.update((conversation) => ({
        ...conversation,
        updatedAt: new Date().toISOString(),
        messages: conversation.messages.map((message) =>
          message.pendingAction?.action_id === actionId
            ? {
                ...message,
                pendingAction: update(message.pendingAction),
              }
            : message,
        ),
      }));
    } else {
      this.archived.update((items) =>
        items.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                updatedAt: new Date().toISOString(),
                messages: conversation.messages.map((message) =>
                  message.pendingAction?.action_id === actionId
                    ? {
                        ...message,
                        pendingAction: update(message.pendingAction),
                      }
                    : message,
                ),
              }
            : conversation,
        ),
      );
    }

    this.persist();
  }

  private archiveCurrentBackend(): void {
    const current = this.current();
    const actions = current.messages
      .map((message) => message.pendingAction)
      .filter((action): action is AssistantPendingAction => !!action);

    if (actions.length === 0) {
      return;
    }

    this.assistant.archiveConversation(current.id).subscribe({
      next: () => {
        if (this.current().id !== current.id) {
          return;
        }

        this.current.update((conversation) => ({
          ...conversation,
          updatedAt: new Date().toISOString(),
          messages: conversation.messages.map((message) =>
            message.pendingAction?.status === 'PENDING'
              ? {
                  ...message,
                  pendingAction: {
                    ...message.pendingAction,
                    status: 'SUPERSEDED',
                  },
                }
              : message,
          ),
        }));
        this.persist();
      },
      error: () => {
        if (this.current().id === current.id) {
          for (const action of actions) {
            this.markActionUnverified(current.id, action.action_id);
          }
        }
      },
    });
  }

  private updatePendingAction(
    actionId: string,
    updatedAction: AssistantPendingAction,
  ): void {
    this.current.update((conversation) => ({
      ...conversation,
      updatedAt: new Date().toISOString(),
      messages: conversation.messages.map((item) =>
        item.pendingAction?.action_id === actionId
          ? { ...item, pendingAction: updatedAction }
          : item,
      ),
    }));
    this.persist();
  }

  private persist(): void {
    const stored = this.storedConversations();
    const snapshot = JSON.stringify(stored);
    if (snapshot === this.lastPersistedSnapshot) {
      return;
    }

    if (this.storage.save(stored)) {
      this.lastPersistedSnapshot = snapshot;
      this.storageError.set(null);
    } else {
      this.storageError.set(
        'No se pudo guardar el historial en el navegador. La conversación sigue disponible en esta sesión.',
      );
    }
  }

  private buildModelContext(
    messages: AssistantDisplayMessage[],
  ): AssistantChatMessage[] {
    return messages
      .slice(-MAX_CONTEXT_MESSAGES)
      .map((message) => ({
        role: message.role,
        content: message.content.slice(0, MAX_CONTEXT_CHARS),
      }));
  }

  private actionsFor(
    conversation: AssistantConversation,
  ): AssistantPendingAction[] {
    return conversation.messages
      .map((message) => message.pendingAction)
      .filter((action): action is AssistantPendingAction => !!action);
  }

  private describeDeleteError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo archivar la conversación. No se eliminó nada. Intentá nuevamente.';
    }

    const code = this.actionErrorCode(error);

    if (code === 'CONVERSATION_ACTION_IN_PROGRESS') {
      return 'No se puede eliminar: hay una operación en ejecución. La conversación y sus datos se conservaron.';
    }

    if (code === 'CONVERSATION_ACTION_RESULT_UNKNOWN') {
      return 'No se puede eliminar: todavía no se pudo verificar el resultado de una operación. La conversación y sus datos se conservaron.';
    }

    if (code === 'CONVERSATION_ID_CONFLICT') {
      return 'No se pudo archivar la conversación porque pertenece a otra identidad. No se eliminó nada.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor. La conversación no fue eliminada. Intentá nuevamente.';
    }

    if (error.status === 409) {
      return 'La conversación no pudo archivarse por un conflicto del servidor. No se eliminó nada.';
    }

    return 'No se pudo archivar la conversación. No se eliminó nada. Intentá nuevamente.';
  }

  private titleFromMessage(message: string): string {
    const normalized = message.replace(/\s+/g, ' ').trim();
    if (normalized.length <= MAX_TITLE_LENGTH) {
      return normalized;
    }

    return `${normalized.slice(0, MAX_TITLE_LENGTH - 1)}…`;
  }

  private roleLabel(role: AssistantRole): string {
    return role === 'ADMIN' ? 'Administrador' : 'Usuario';
  }

  private actionErrorCode(error: unknown): string | null {
    if (!(error instanceof HttpErrorResponse)) {
      return null;
    }

    return (error.error as AssistantError | null)?.code ?? null;
  }

  private describeActionError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo completar la acción. Intentá nuevamente.';
    }

    const code = this.actionErrorCode(error);

    if (code === 'ACTION_RESULT_UNKNOWN') {
      return 'No se pudo confirmar el resultado. Verificá si la operación se realizó antes de intentar crear otra.';
    }

    if (code === 'ACTION_EXECUTION_FAILED') {
      return (
        (error.error as AssistantError | null)?.message ??
        'La operación no pudo completarse en el servidor.'
      );
    }

    if (code === 'ACTION_ALREADY_EXECUTING') {
      return 'La acción ya se está ejecutando. No la cierres ni reintentes todavía.';
    }

    if (code === 'ACTION_EXPIRED') {
      return 'La acción venció. Prepará una nueva si todavía la necesitás.';
    }

    if (code === 'ACTION_NOT_FOUND') {
      return 'La acción ya no está disponible para esta conversación.';
    }

    if (code === 'ACTION_NOT_PENDING') {
      return 'La acción ya no está pendiente.';
    }

    if (error.status === 401) {
      return 'La identidad demo no está disponible.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el servidor.';
    }

    return 'No se pudo completar la acción. Intentá nuevamente.';
  }

  private describeError(error: unknown): string {
    if (!(error instanceof HttpErrorResponse)) {
      return 'No se pudo obtener una respuesta. Intentá nuevamente.';
    }

    if (error.status === 0) {
      return 'No se pudo conectar con el asistente. Verificá que el servicio de IA esté en ejecución.';
    }

    if (error.status === 401) {
      return 'La identidad demo no está disponible. Verificá la configuración local.';
    }

    if (error.status === 502) {
      return 'El asistente no pudo verificar tu rol en este momento. Intentá nuevamente.';
    }

    if (error.status === 503) {
      return 'El modelo de lenguaje no está disponible. Intentá nuevamente más tarde.';
    }

    const code = (error.error as AssistantError | null)?.code;
    if (code === 'VALIDATION_ERROR') {
      return 'La solicitud no es válida. Revisá los datos e intentá nuevamente.';
    }

    return 'No se pudo obtener una respuesta. Intentá nuevamente.';
  }
}
