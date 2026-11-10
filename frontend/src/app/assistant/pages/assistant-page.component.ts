import { DatePipe } from '@angular/common';
import {
  Component,
  SecurityContext,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer, type SafeHtml } from '@angular/platform-browser';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type {
  AssistantConversation,
  AssistantPendingAction,
} from '../models/assistant.models';
import { characterCount } from '../../publications/utils/character-count';
import { markdownToHtml } from '../markdown';
import { AssistantConversationStore } from '../services/assistant-conversation.store';

@Component({
  selector: 'app-assistant-page',
  imports: [DatePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './assistant-page.component.html',
  styleUrl: './assistant-page.component.scss',
  host: {
    '[class.assistant-compact]': 'compact()',
  },
})
export class AssistantPageComponent {
  private readonly store = inject(AssistantConversationStore);
  private readonly sanitizer = inject(DomSanitizer);

  readonly compact = input(false);
  readonly input = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(1000)],
  });
  readonly questionCharacterCount = characterCount(this.input);
  readonly messages = this.store.messages;
  readonly loading = this.store.loading;
  readonly errorMessage = this.store.errorMessage;
  readonly actionInProgress = this.store.actionInProgress;
  readonly actionError = this.store.actionError;
  readonly conversations = this.store.conversations;
  readonly currentConversation = this.store.currentConversation;
  readonly selectedConversation = this.store.selectedConversation;
  readonly currentConversationId = this.store.currentConversationId;
  readonly isReadOnly = this.store.isReadOnly;
  readonly deleteInProgress = this.store.deleteInProgress;
  readonly deleteVerificationInProgress =
    this.store.deleteVerificationInProgress;
  readonly deleteError = this.store.deleteError;
  readonly storageError = this.store.storageError;
  readonly currentConversationArchivedRemotely = computed(() =>
    this.store.isRemotelyArchived(this.currentConversationId()),
  );
  readonly deleteCandidate = signal<AssistantConversation | null>(null);
  readonly historyOpen = signal(false);
  readonly historyItems = computed(() => {
    const current = this.currentConversation();
    const items = this.conversations();

    if (
      current.messages.length === 0 &&
      !items.some((item) => item.id === current.id)
    ) {
      return [current, ...items];
    }

    return items;
  });

  get conversationId(): string {
    return this.store.conversationId;
  }

  readonly quickPrompts = [
    '¿Cómo busco una publicación?',
    '¿Cómo solicito recuperar un objeto?',
    '¿Qué puede hacer un administrador?',
  ];

  send(prompt?: string): void {
    if (this.loading() || this.isReadOnly()) {
      return;
    }

    const message = (prompt ?? this.input.value).trim();

    if (!message) {
      this.input.markAsTouched();
      return;
    }

    this.input.reset('');
    this.store.send(message);
  }

  canConfirmPendingAction(action: AssistantPendingAction): boolean {
    return this.store.canConfirmPendingAction(action);
  }

  confirmPendingAction(action: AssistantPendingAction): void {
    this.store.confirmPendingAction(action);
  }

  cancelPendingAction(action: AssistantPendingAction): void {
    this.store.cancelPendingAction(action);
  }

  toggleHistory(): void {
    this.historyOpen.update((open) => !open);
  }

  selectConversation(id: string): void {
    this.store.selectConversation(id);
    this.historyOpen.set(false);
  }

  startNewConversation(): void {
    this.store.startNewConversation();
    this.historyOpen.set(false);
  }

  continueSelectedConversation(): void {
    const selected = this.selectedConversation();
    if (!selected) {
      return;
    }

    this.store.continueConversation(selected.id);
    this.historyOpen.set(false);
  }

  returnToCurrentConversation(): void {
    this.store.returnToCurrentConversation();
  }

  canDeleteConversation(conversation: AssistantConversation): boolean {
    return (
      !this.deleteInProgress() &&
      !this.deleteVerificationInProgress() &&
      this.store.canDeleteConversation(conversation)
    );
  }

  deleteButtonDisabled(): boolean {
    return (
      this.deleteInProgress() !== null ||
      this.deleteVerificationInProgress() !== null
    );
  }

  deleteButtonBlocked(conversation: AssistantConversation): boolean {
    if (
      this.deleteInProgress() ||
      this.deleteVerificationInProgress() ||
      this.store.isRemotelyArchived(conversation.id) ||
      this.store.deleteRequiresVerification(conversation)
    ) {
      return false;
    }

    return !this.store.canDeleteConversation(conversation);
  }

  deleteButtonLabel(conversation: AssistantConversation): string {
    if (this.deleteInProgress() === conversation.id) {
      return 'Eliminando…';
    }
    if (this.deleteVerificationInProgress() === conversation.id) {
      return 'Verificando…';
    }
    if (this.store.isRemotelyArchived(conversation.id)) {
      return 'Reintentar limpieza';
    }
    if (this.store.deleteRequiresVerification(conversation)) {
      return 'Verificar estado';
    }
    return 'Eliminar';
  }

  deleteButtonTitle(conversation: AssistantConversation): string {
    const title = this.conversationTitle(conversation);
    if (this.deleteInProgress() === conversation.id) {
      return `Eliminando «${title}».`;
    }
    if (this.deleteVerificationInProgress() === conversation.id) {
      return `Verificando el estado de las operaciones de «${title}».`;
    }
    if (this.store.isRemotelyArchived(conversation.id)) {
      return 'El chat ya fue archivado en el servidor. Reintentá la limpieza del historial local.';
    }

    return (
      this.store.deleteBlockReason(conversation) ??
      this.store.deleteWarning(conversation) ??
      `Eliminar «${title}».`
    );
  }

  deleteReasonId(conversation: AssistantConversation): string {
    return `assistant-delete-reason-${conversation.id}`;
  }

  deleteWarning(conversation: AssistantConversation): string | null {
    return this.store.deleteWarning(conversation);
  }

  isRemotelyArchived(conversation: AssistantConversation): boolean {
    return this.store.isRemotelyArchived(conversation.id);
  }

  requestDeleteConversation(conversation: AssistantConversation): void {
    if (
      this.deleteInProgress() ||
      this.deleteVerificationInProgress()
    ) {
      return;
    }

    if (this.store.isRemotelyArchived(conversation.id)) {
      this.deleteCandidate.set(conversation);
      return;
    }

    if (this.store.deleteRequiresVerification(conversation)) {
      this.store
        .verifyConversationForDeletion(conversation.id)
        .subscribe((allowed) => {
          if (allowed) {
            this.deleteCandidate.set(conversation);
          }
        });
      return;
    }

    if (!this.store.canDeleteConversation(conversation)) {
      return;
    }

    this.deleteCandidate.set(conversation);
  }

  cancelDeleteConversation(): void {
    this.deleteCandidate.set(null);
  }

  confirmDeleteConversation(): void {
    const candidate = this.deleteCandidate();
    if (!candidate) {
      return;
    }

    this.deleteCandidate.set(null);
    this.store.deleteConversation(candidate.id);
  }

  conversationTitle(conversation: AssistantConversation): string {
    if (conversation.title.trim()) {
      return conversation.title;
    }

    return conversation.id === this.currentConversationId()
      ? 'Conversación actual'
      : 'Conversación sin título';
  }

  isCurrentConversation(id: string): boolean {
    return id === this.currentConversationId();
  }

  actionResultLink(action: AssistantPendingAction): string | null {
    const result = action.result;

    if (!result) {
      return null;
    }

    if (
      action.action_type === 'CREATE_LOST_PUBLICATION' ||
      action.action_type === 'CREATE_FOUND_PUBLICATION'
    ) {
      return result.id ? `/publications/${result.id}` : null;
    }

    if (action.action_type === 'CREATE_RECOVERY_REQUEST') {
      return '/recovery-requests';
    }

    return null;
  }

  actionResultTitle(action: AssistantPendingAction): string {
    if (action.action_type === 'CREATE_RECOVERY_REQUEST') {
      return 'Ver mis solicitudes';
    }

    return 'Ver publicación';
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Enter' || event.isComposing) {
      return;
    }

    if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();
    this.send();
  }

  renderMarkdown(content: string): SafeHtml {
    const sanitized =
      this.sanitizer.sanitize(
        SecurityContext.HTML,
        markdownToHtml(content),
      ) ?? '';
    return this.sanitizer.bypassSecurityTrustHtml(sanitized);
  }

}
