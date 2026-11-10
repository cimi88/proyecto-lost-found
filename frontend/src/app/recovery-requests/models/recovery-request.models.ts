import type { PublicationCategory } from '../../publications/domain/publication-category';
import type {
  PublicationStatus,
  PublicationType,
} from '../../publications/models/publication-search.models';

export type RecoveryRequestStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'COMPLETED';

export const RECOVERY_REQUEST_STATUS_LABELS: Record<
  RecoveryRequestStatus,
  string
> = {
  PENDING: 'Pendiente',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  CANCELLED: 'Cancelada',
  COMPLETED: 'Completada',
};

export const ACTIVE_RECOVERY_REQUEST_STATUSES: ReadonlyArray<RecoveryRequestStatus> =
  ['PENDING', 'APPROVED'];

export interface RecoveryRequestPublication {
  id: string;
  type: PublicationType;
  status: PublicationStatus;
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
}

export interface RecoveryRequest {
  id: string;
  status: RecoveryRequestStatus;
  notes: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  returnNotes: string | null;
  createdAt: string;
  updatedAt: string;
  publication: RecoveryRequestPublication;
  requesterDisplayName: string;
}

export interface CreateRecoveryRequest {
  notes?: string;
}

export interface CancelRecoveryRequest {
  reason: string;
}

export interface CompleteRecoveryRequest {
  returnNotes?: string;
}

export function isActiveRecoveryRequest(
  request: RecoveryRequest,
): boolean {
  return ACTIVE_RECOVERY_REQUEST_STATUSES.includes(request.status);
}
