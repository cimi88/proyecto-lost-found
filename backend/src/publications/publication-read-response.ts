import type { PublicationCategory } from './domain/publication-category';
import type { PublicationType } from './domain/publication-status';
import type { Publication } from './publication.entity';

export interface PublicationSummaryResponse {
  id: string;
  type: PublicationType;
  status: 'ACTIVE';
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
}

export interface PublicationDetailResponse extends PublicationSummaryResponse {
  updatedAt: string;
}

export interface PublicationSearchResponse {
  items: PublicationSummaryResponse[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function toPublicationSummaryResponse(
  publication: Publication,
): PublicationSummaryResponse {
  return {
    id: publication.id,
    type: publication.type,
    status: 'ACTIVE',
    title: publication.title,
    description: publication.description,
    category: publication.category,
    location: publication.location,
    eventDate: publication.eventDate,
    createdAt: toIsoString(publication.createdAt),
  };
}

export function toPublicationDetailResponse(
  publication: Publication,
): PublicationDetailResponse {
  return {
    ...toPublicationSummaryResponse(publication),
    updatedAt: toIsoString(publication.updatedAt),
  };
}
