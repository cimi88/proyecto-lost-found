import type { PublicationCategory } from './publication-category';

/**
 * Contrato HTTP v1 — solicitudes de recuperación.
 *
 * Endpoints:
 * - POST /api/v1/publications/:id/recovery-requests
 * - GET /api/v1/recovery-requests/mine
 * - GET /api/v1/recovery-requests/received (propietario: sus solicitudes;
 *   ADMIN: todas las APPROVED pendientes de devolución)
 * - POST /api/v1/recovery-requests/:id/approve
 * - POST /api/v1/recovery-requests/:id/reject
 * - POST /api/v1/recovery-requests/:id/complete
 * - POST /api/v1/recovery-requests/:id/cancel
 *
 * Todos requieren X-Demo-User-Id mientras AUTH_MODE=demo. Las respuestas no
 * exponen ownerId, requesterId, cancelledById, correo ni datos de contacto.
 */
export type RecoveryRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED';

export type RecoveryRequestPublicationStatus =
  | 'ACTIVE'
  | 'RESERVED'
  | 'RETURNED'
  | 'CLOSED';

export interface CreateRecoveryRequest {
  /** Opcional, recortado, máximo 500 caracteres. */
  notes?: string;
}

export interface CancelRecoveryRequest {
  /** Obligatorio, recortado, entre 3 y 500 caracteres. */
  reason: string;
}

export interface CompleteRecoveryRequest {
  /** Opcional, recortado, máximo 500 caracteres. */
  returnNotes?: string;
}

export interface RecoveryRequestPublication {
  id: string;
  type: 'LOST' | 'FOUND';
  status: RecoveryRequestPublicationStatus;
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
}

export interface RecoveryRequestResponse {
  id: string;
  status: RecoveryRequestStatus;
  notes: string | null;
  cancellationReason: string | null;
  /** Fecha de la devolución cuando el estado es COMPLETED. */
  completedAt: string | null;
  /** Observaciones opcionales de la devolución. */
  returnNotes: string | null;
  /** Fecha de creación de la solicitud. */
  createdAt: string;
  /**
   * Última modificación de la fila. No es la fecha de aprobación, rechazo ni
   * cancelación; la interfaz no debe presentarla como tal.
   */
  updatedAt: string;
  publication: RecoveryRequestPublication;
  /** Único dato de identidad expuesto; nunca el correo. */
  requesterDisplayName: string;
}

export type RecoveryRequestErrorCode =
  | 'VALIDATION_ERROR'
  | 'DEMO_IDENTITY_REQUIRED'
  | 'DEMO_IDENTITY_INVALID'
  | 'PUBLICATION_NOT_FOUND'
  | 'RECOVERY_REQUEST_NOT_FOUND'
  | 'RECOVERY_REQUEST_FORBIDDEN'
  | 'RECOVERY_REQUEST_DUPLICATE'
  | 'RECOVERY_REQUEST_NOT_PENDING'
  | 'RECOVERY_REQUEST_NOT_APPROVED'
  | 'RECOVERY_REQUEST_ALREADY_COMPLETED'
  | 'RECOVERY_REQUEST_NOT_CANCELLABLE'
  | 'RECOVERY_REQUEST_CONFLICT'
  | 'INTERNAL_ERROR';

export interface RecoveryRequestError {
  statusCode: number;
  code: RecoveryRequestErrorCode;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export const RECOVERY_REQUESTS_ENDPOINT = '/api/v1/recovery-requests';
export const RECOVERY_REQUESTS_MINE_ENDPOINT =
  '/api/v1/recovery-requests/mine';
export const RECOVERY_REQUESTS_RECEIVED_ENDPOINT =
  '/api/v1/recovery-requests/received';
export const RECOVERY_REQUEST_COMPLETE_ENDPOINT =
  '/api/v1/recovery-requests/:id/complete';
export const PUBLICATION_RECOVERY_REQUESTS_ENDPOINT =
  '/api/v1/publications/:id/recovery-requests';
