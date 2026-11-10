import type { PublicationCategory } from './domain/publication-category';
import type { Publication } from './publication.entity';

export interface LostPublicationResponse {
  id: string;
  type: 'LOST';
  status: 'ACTIVE';
  ownerId: string;
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

export function toLostPublicationResponse(
  publication: Publication,
): LostPublicationResponse {
  return {
    id: publication.id,
    type: 'LOST',
    status: 'ACTIVE',
    ownerId: publication.ownerId,
    title: publication.title,
    description: publication.description,
    category: publication.category,
    location: publication.location,
    eventDate: publication.eventDate,
    createdAt: toIsoString(publication.createdAt),
    updatedAt: toIsoString(publication.updatedAt),
  };
}
