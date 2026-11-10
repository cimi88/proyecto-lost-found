export type AssistantRole = 'USER' | 'ADMIN';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantChatRequest {
  /** Entre 1 y 1000 caracteres. */
  message: string;
  /** Máximo 10 mensajes; solo memoria del navegador. */
  history: AssistantChatMessage[];
  /**
   * UUID generado por la instancia Angular del asistente. Es opcional durante
   * la transición; los clientes antiguos conservan el chat stateless.
   */
  conversation_id?: string;
}

export interface AssistantPendingActionField {
  label: string;
  value: string;
}

export interface AssistantPendingAction {
  action_id: string;
  action_type:
    | 'CREATE_LOST_PUBLICATION'
    | 'CREATE_FOUND_PUBLICATION'
    | 'CREATE_RECOVERY_REQUEST';
  title: string;
  fields: AssistantPendingActionField[];
  expires_at: string;
  status: 'PENDING';
  /** Capacidad efímera devuelta solo durante la preparación. */
  confirmation_token?: string;
}

export interface AssistantChatResponse {
  reply: string;
  role: AssistantRole;
  pending_action?: AssistantPendingAction;
}

export interface AssistantActionResult {
  id?: string;
  type?: string;
  status?: string;
  title?: string;
  publication?: { id?: string; title?: string; status?: string };
  [key: string]: unknown;
}

export interface AssistantConfirmActionRequest {
  conversation_id: string;
  action_id: string;
  confirmation_token: string;
}

export interface AssistantActionConfirmResponse {
  action_id: string;
  action_type:
    | 'CREATE_LOST_PUBLICATION'
    | 'CREATE_FOUND_PUBLICATION'
    | 'CREATE_RECOVERY_REQUEST';
  status: 'COMPLETED';
  result?: AssistantActionResult;
  message: string;
}

export interface AssistantCancelActionRequest {
  conversation_id: string;
  action_id: string;
}

export interface AssistantActionCancelResponse {
  action_id: string;
  status: 'CANCELLED';
  message: string;
}

export interface AssistantActionStatusResponse {
  action_id: string;
  action_type:
    | 'CREATE_LOST_PUBLICATION'
    | 'CREATE_FOUND_PUBLICATION'
    | 'CREATE_RECOVERY_REQUEST';
  status:
    | 'PENDING'
    | 'EXECUTING'
    | 'COMPLETED'
    | 'FAILED'
    | 'CANCELLED'
    | 'EXPIRED'
    | 'SUPERSEDED';
  created_at: string;
  expires_at: string;
  result?: AssistantActionResult;
  error?: string;
  result_unknown?: boolean;
}

export interface AssistantArchiveConversationResponse {
  conversation_id: string;
  archived: boolean;
  superseded: number;
}

export interface AssistantContextResponse {
  role: AssistantRole;
}

export interface AssistantError {
  statusCode: number;
  code:
    | 'VALIDATION_ERROR'
    | 'DEMO_IDENTITY_REQUIRED'
    | 'DEMO_IDENTITY_INVALID'
    | 'CONVERSATION_ID_CONFLICT'
    | 'ACTION_NOT_FOUND'
    | 'ACTION_NOT_PENDING'
    | 'ACTION_EXPIRED'
    | 'ACTION_ALREADY_EXECUTING'
    | 'ACTION_NOT_CANCELLABLE'
    | 'ACTION_PAYLOAD_INVALID'
    | 'ACTION_EXECUTION_FAILED'
    | 'ACTION_RESULT_UNKNOWN'
    | 'ASSISTANT_UNAVAILABLE'
    | 'ASSISTANT_UPSTREAM_ERROR'
    | 'HTTP_ERROR'
    | (string & {});
  message: string;
}

export const ASSISTANT_CHAT_ENDPOINT = '/chat';
export const ASSISTANT_CONFIRM_ENDPOINT = '/chat/confirm';
export const ASSISTANT_CANCEL_ENDPOINT = '/chat/cancel';
export const ASSISTANT_ACTION_STATUS_ENDPOINT = '/chat/actions/{action_id}';
export const ASSISTANT_ARCHIVE_CONVERSATION_ENDPOINT =
  '/chat/conversations/{conversation_id}/archive';
export const ASSISTANT_CONTEXT_ENDPOINT = '/api/v1/assistant/context';
