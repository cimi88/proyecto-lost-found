export type AssistantRole = 'USER' | 'ADMIN';

export interface AssistantChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantDisplayMessage {
  role: 'user' | 'assistant';
  content: string;
  roleLabel?: string;
  pendingAction?: AssistantPendingAction;
}

export interface AssistantConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: AssistantDisplayMessage[];
  continuedFrom?: {
    id: string;
    title: string;
    createdAt: string;
  };
}

export interface AssistantChatRequest {
  message: string;
  history: AssistantChatMessage[];
  /** UUID estable de la instancia Angular del asistente. */
  conversation_id?: string;
}

export interface AssistantPendingActionField {
  label: string;
  value: string;
}

export type AssistantActionStatus =
  | 'PENDING'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'SUPERSEDED'
  | 'UNVERIFIED';

export interface AssistantActionResult {
  id?: string;
  type?: string;
  status?: string;
  title?: string;
  publication?: { id?: string; title?: string; status?: string };
  [key: string]: unknown;
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
  status: AssistantActionStatus;
  confirmation_token?: string;
  result?: AssistantActionResult;
  errorCode?: string;
  errorMessage?: string;
}

export interface AssistantChatResponse {
  reply: string;
  role: AssistantRole;
  pending_action?: AssistantPendingAction;
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
  status: AssistantActionStatus;
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

export interface AssistantError {
  statusCode: number;
  code: string;
  message: string;
}
