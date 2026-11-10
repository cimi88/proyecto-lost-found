import type { PublicationCategory } from './domain/publication-category';
import type {
  PublicationStatus,
  PublicationType,
} from './domain/publication-status';
import type { Publication } from './publication.entity';

export interface OwnPublicationResponse {
  id: string;
  type: PublicationType;
  status: PublicationStatus;
  title: string;
  description: string;
  category: PublicationCategory;
  location: string;
  eventDate: string;
  createdAt: string;
  updatedAt: string;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

export function toOwnPublicationResponse(
  publication: Publication,
): OwnPublicationResponse {
  return {
    id: publication.id,
    type: publication.type,
    status: publication.status,
    title: publication.title,
    description: publication.description,
    category: publication.category,
    location: publication.location,
    eventDate: publication.eventDate,
    createdAt: toIsoString(publication.createdAt),
    updatedAt: toIsoString(publication.updatedAt),
  };
}
