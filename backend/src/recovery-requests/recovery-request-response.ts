import type { PublicationCategory } from '../publications/domain/publication-category';
import type {
  PublicationStatus,
  PublicationType,
} from '../publications/domain/publication-status';
import type { RecoveryRequestStatus } from './domain/recovery-request-status';

export interface RecoveryRequestPublicationResponse {
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

export interface RecoveryRequestResponse {
  id: string;
  status: RecoveryRequestStatus;
  notes: string | null;
  cancellationReason: string | null;
  completedAt: string | null;
  returnNotes: string | null;
  createdAt: string;
  updatedAt: string;
  publication: RecoveryRequestPublicationResponse;
  requesterDisplayName: string;
}

export interface RawRecoveryRequestResponse {
  request_id: string;
  request_status: RecoveryRequestStatus;
  request_notes: string | null;
  request_cancellation_reason: string | null;
  request_completed_at: Date | string | null;
  request_return_notes: string | null;
  request_created_at: Date | string;
  request_updated_at: Date | string;
  publication_id: string;
  publication_type: PublicationType;
  publication_status: PublicationStatus;
  publication_title: string;
  publication_description: string;
  publication_category: PublicationCategory;
  publication_location: string;
  publication_event_date: string;
  publication_created_at: Date | string;
  requester_display_name: string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function toRecoveryRequestResponse(
  raw: RawRecoveryRequestResponse,
): RecoveryRequestResponse {
  return {
    id: raw.request_id,
    status: raw.request_status,
    notes: raw.request_notes,
    cancellationReason: raw.request_cancellation_reason,
    completedAt: raw.request_completed_at
      ? toIsoString(raw.request_completed_at)
      : null,
    returnNotes: raw.request_return_notes,
    createdAt: toIsoString(raw.request_created_at),
    updatedAt: toIsoString(raw.request_updated_at),
    publication: {
      id: raw.publication_id,
      type: raw.publication_type,
      status: raw.publication_status,
      title: raw.publication_title,
      description: raw.publication_description,
      category: raw.publication_category,
      location: raw.publication_location,
      eventDate: raw.publication_event_date,
      createdAt: toIsoString(raw.publication_created_at),
    },
    requesterDisplayName: raw.requester_display_name,
  };
}
