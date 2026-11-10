import type { PublicationCategory } from '../domain/publication-category';

export type PublicationType = 'LOST' | 'FOUND';
export type PublicationStatus =
  | 'ACTIVE'
  | 'RESERVED'
  | 'RETURNED'
  | 'CLOSED';

export const PUBLICATION_TYPE_LABELS: Record<PublicationType, string> = {
  LOST: 'Perdido',
  FOUND: 'Encontrado',
};

export const PUBLICATION_STATUS_LABELS: Record<PublicationStatus, string> = {
  ACTIVE: 'Activa',
  RESERVED: 'Reservada',
  RETURNED: 'Devuelta',
  CLOSED: 'Cerrada',
};

export type PublicationSort = 'recent' | 'oldest' | 'relevance';

export const DEFAULT_PUBLICATION_SORT: PublicationSort = 'recent';

export const PUBLICATION_SORT_LABELS: Record<PublicationSort, string> = {
  recent: 'Más recientes',
  oldest: 'Más antiguas',
  relevance: 'Relevancia',
};

export interface PublicationSummary {
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

export interface PublicationDetail extends PublicationSummary {
  updatedAt: string;
}

export interface PublicationSearchResponse {
  items: PublicationSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PublicationSearchCriteria {
  q?: string;
  type?: PublicationType;
  category?: PublicationCategory;
  eventDateFrom?: string;
  eventDateTo?: string;
  sort?: PublicationSort;
}

export interface PublicationSearchParams extends PublicationSearchCriteria {
  page: number;
  pageSize: number;
}

export type {
  ApiErrorDetail,
  ApiErrorResponse,
} from './lost-publication.models';
