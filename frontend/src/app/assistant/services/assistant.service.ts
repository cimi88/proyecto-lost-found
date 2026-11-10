import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import type {
  AssistantActionCancelResponse,
  AssistantActionConfirmResponse,
  AssistantActionStatusResponse,
  AssistantArchiveConversationResponse,
  AssistantChatMessage,
  AssistantChatResponse,
} from '../models/assistant.models';

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.assistantBaseUrl;

  chat(
    message: string,
    history: AssistantChatMessage[],
    conversationId: string,
  ): Observable<AssistantChatResponse> {
    return this.http.post<AssistantChatResponse>(`${this.baseUrl}/chat`, {
      message,
      history,
      conversation_id: conversationId,
    });
  }

  confirmAction(
    conversationId: string,
    actionId: string,
    confirmationToken: string,
  ): Observable<AssistantActionConfirmResponse> {
    return this.http.post<AssistantActionConfirmResponse>(
      `${this.baseUrl}/chat/confirm`,
      {
        conversation_id: conversationId,
        action_id: actionId,
        confirmation_token: confirmationToken,
      },
    );
  }

  getActionStatus(
    conversationId: string,
    actionId: string,
  ): Observable<AssistantActionStatusResponse> {
    return this.http.get<AssistantActionStatusResponse>(
      `${this.baseUrl}/chat/actions/${actionId}`,
      {
        params: { conversation_id: conversationId },
      },
    );
  }

  archiveConversation(
    conversationId: string,
  ): Observable<AssistantArchiveConversationResponse> {
    return this.http.post<AssistantArchiveConversationResponse>(
      `${this.baseUrl}/chat/conversations/${conversationId}/archive`,
      {},
    );
  }

  cancelAction(
    conversationId: string,
    actionId: string,
  ): Observable<AssistantActionCancelResponse> {
    return this.http.post<AssistantActionCancelResponse>(
      `${this.baseUrl}/chat/cancel`,
      {
        conversation_id: conversationId,
        action_id: actionId,
      },
    );
  }
}
